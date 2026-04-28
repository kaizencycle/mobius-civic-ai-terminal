#!/usr/bin/env npx tsx
/**
 * flush-epicon-dedup.ts
 *
 * One-shot script to clear the EPICON promotion dedup keys blocking the lane.
 * Run from the repo root:
 *
 *   npx tsx scripts/flush-epicon-dedup.ts
 *
 * Requires .env.local with:
 *   UPSTASH_REDIS_REST_URL=...
 *   UPSTASH_REDIS_REST_TOKEN=...
 *
 * C-295 — EPICON Promotion Lane Fix
 * Safe to run: deletes only dedup/stall keys, never ledger data or vault state.
 *
 * Key naming (as of C-295 fix):
 *   epicon:promotion:state:<cycleId>  — cycle-scoped promotion state (current)
 *   epicon:promotion:stall:<cycleId>  — stall counter (current)
 *   epicon:promotion:state            — legacy global key (pre-fix, no cycle scope)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local from repo root
config({ path: resolve(process.cwd(), '.env.local') });

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('❌  Missing UPSTASH_REDIS_REST_URL / KV_REST_API_URL or token in .env.local');
  process.exit(1);
}

// ── Minimal Upstash REST client ───────────────────────────────────────────────

async function kvDel(key: string): Promise<'deleted' | 'not_found'> {
  const res = await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = await res.json() as { result: number };
  return json.result === 1 ? 'deleted' : 'not_found';
}

async function kvGet(key: string): Promise<unknown> {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = await res.json() as { result: string | null };
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return json.result; }
}

async function kvKeys(pattern: string): Promise<string[]> {
  const res = await fetch(`${UPSTASH_URL}/keys/${encodeURIComponent(pattern)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = await res.json() as { result: string[] };
  return json.result ?? [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍  EPICON Dedup Flush — C-295\n');
  console.log('Step 1: Scanning for dedup/stall keys...\n');

  // Current key patterns (lowercase colon-separated, as written by lib/epicon/promotion.ts)
  const scanPatterns = [
    'epicon:promotion:state:*',
    'epicon:promotion:stall:*',
  ];

  const foundKeys: string[] = [];
  for (const pattern of scanPatterns) {
    const keys = await kvKeys(pattern);
    foundKeys.push(...keys);
  }

  // Explicit keys to always check — covers current + legacy naming
  const explicitKeys = [
    // Current naming (C-295+)
    'epicon:promotion:state:C-294',
    'epicon:promotion:state:C-293',
    'epicon:promotion:stall:C-294',
    'epicon:promotion:stall:C-293',
    // Legacy global key (pre C-295 fix, no cycle scope)
    'epicon:promotion:state',
  ];

  const allKeys = [...new Set([...foundKeys, ...explicitKeys])];

  console.log(`Found ${foundKeys.length} keys via pattern scan.`);
  console.log(`Checking ${allKeys.length} total keys (pattern + explicit)...\n`);

  // Step 2: Read each key before deleting
  console.log('Step 2: Reading key contents before flush...\n');
  const results: { key: string; existed: boolean; type: string; size: number; action: string }[] = [];

  for (const key of allKeys) {
    const value = await kvGet(key);
    if (value === null) {
      results.push({ key, existed: false, type: 'none', size: 0, action: 'skip' });
      continue;
    }

    let type = typeof value;
    let size = 0;
    if (Array.isArray(value)) {
      type = 'array';
      size = (value as unknown[]).length;
    } else if (typeof value === 'object' && value !== null) {
      type = 'object';
      size = Object.keys(value as object).length;
    } else if (typeof value === 'number') {
      size = value as number;
    }

    results.push({ key, existed: true, type, size, action: 'pending' });
  }

  const existing = results.filter(r => r.existed);
  if (existing.length === 0) {
    console.log('⚠️   No dedup keys found in KV.\n');
    console.log('    Possibilities:');
    console.log('    a) Keys already expired (72h TTL)');
    console.log('    b) Promotion state was never written (first run)');
    console.log('    c) Running against wrong Redis instance\n');
    console.log('    → Run with --scan-all to enumerate all epicon:* keys.\n');
  } else {
    console.log('Keys found:\n');
    for (const r of existing) {
      const sizeLabel = r.type === 'object'
        ? `${r.size} item IDs`
        : r.type === 'number'
        ? `stall count = ${r.size}`
        : `${r.size} entries`;
      console.log(`  📦  ${r.key}  (${r.type}, ${sizeLabel})`);
    }
    console.log('');
  }

  // Step 3: Delete all dedup/stall keys that exist
  console.log('Step 3: Deleting dedup/stall keys...\n');
  let deletedCount = 0;

  for (const r of results.filter(r => r.existed && r.action === 'pending')) {
    const outcome = await kvDel(r.key);
    r.action = outcome;
    if (outcome === 'deleted') {
      deletedCount++;
      const sizeLabel = r.type === 'object' ? `${r.size} blocked item IDs freed` : `stall count cleared`;
      console.log(`  ✅  deleted  ${r.key}  (${sizeLabel})`);
    } else {
      console.log(`  ○   skipped  ${r.key}  (already gone)`);
    }
  }

  if (deletedCount === 0 && existing.length === 0) {
    console.log('  Nothing to delete.\n');
  }

  // Step 4: Verify the promote endpoint GET
  console.log('\nStep 4: Verifying promotion lane via GET /api/epicon/promote...\n');
  try {
    const res = await fetch('https://mobius-civic-ai-terminal.vercel.app/api/epicon/promote');
    const data = await res.json() as {
      diagnostics?: {
        promoter_eligible_count?: number;
        promoter_excluded_reasons?: Record<string, number>;
        promoter_input_count?: number;
      };
      counters?: { pending_promotable_count?: number };
    };

    const diag = data?.diagnostics;
    const alreadyPromoted = diag?.promoter_excluded_reasons?.already_promoted ?? 'unknown';
    const eligible        = diag?.promoter_eligible_count ?? 'unknown';
    const input           = diag?.promoter_input_count ?? 'unknown';
    const pending         = data?.counters?.pending_promotable_count ?? 'unknown';

    console.log(`  promoter_input_count:     ${input}`);
    console.log(`  promoter_eligible_count:  ${eligible}`);
    console.log(`  already_promoted:         ${alreadyPromoted}`);
    console.log(`  pending_promotable_count: ${pending}`);

    if (typeof alreadyPromoted === 'number' && typeof input === 'number') {
      if (alreadyPromoted === 0) {
        console.log('\n  ✅  PROMOTION LANE CLEAR — already_promoted = 0.');
        console.log('      Trigger POST /api/epicon/promote to start promoting.\n');
      } else if (alreadyPromoted < input) {
        console.log('\n  🟡  Partial improvement — some items still blocked.');
        console.log('      The remaining blocked items may be legitimately promoted this cycle.\n');
      } else {
        console.log('\n  ⚠️   Lane still fully blocked (already_promoted = input).');
        console.log('      The deploy may not include the C-295 fix yet, or state is being');
        console.log('      reconstructed from the in-memory mirror. Wait for the next cold');
        console.log('      start or trigger a redeployment.\n');
      }
    }
  } catch (err) {
    console.log(`  ❌  Could not reach promote endpoint: ${err}\n`);
  }

  // Summary
  console.log('── Summary ────────────────────────────────────────────────────────────');
  console.log(`  Keys deleted:   ${deletedCount}`);
  console.log(`  Keys not found: ${results.filter(r => !r.existed).length}`);
  console.log('───────────────────────────────────────────────────────────────────────\n');

  if (deletedCount > 0) {
    console.log('Next: POST /api/epicon/promote to run a fresh promotion cycle.');
    console.log('      Expect promoted > 0 in the response.\n');
  }
}

// ── Scan-all mode ─────────────────────────────────────────────────────────────

async function scanAll() {
  console.log('\n🔬  Full KV scan for EPICON-related keys...\n');
  // Include both lowercase (current) and uppercase (historical) patterns
  const patterns = [
    'epicon:*',
    'EPICON*',
    'EPICON_PROMOTED*',
    'EPICON_PROMOTION*',
  ];
  for (const p of patterns) {
    const keys = await kvKeys(p);
    if (keys.length > 0) {
      console.log(`  ${p}  →  ${keys.length} key(s):`);
      for (const k of keys.slice(0, 20)) {
        console.log(`    ${k}`);
      }
      if (keys.length > 20) console.log(`    ... and ${keys.length - 20} more`);
      console.log('');
    } else {
      console.log(`  ${p}  →  (none)\n`);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--scan-all')) {
  scanAll().catch(console.error);
} else {
  main().catch(console.error);
}
