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
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local from repo root
config({ path: resolve(process.cwd(), '.env.local') });

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('❌  Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in .env.local');
  process.exit(1);
}

// ── Minimal Upstash REST client (no SDK dependency needed) ──────────────────

async function kvDel(key: string): Promise<'deleted' | 'not_found'> {
  const res = await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = (await res.json()) as { result: number };
  return json.result === 1 ? 'deleted' : 'not_found';
}

async function kvGet(key: string): Promise<unknown> {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = (await res.json()) as { result: string | null };
  if (!json.result) return null;
  try {
    return JSON.parse(json.result);
  } catch {
    return json.result;
  }
}

async function kvKeys(pattern: string): Promise<string[]> {
  const res = await fetch(`${UPSTASH_URL}/keys/${encodeURIComponent(pattern)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = (await res.json()) as { result: string[] };
  return json.result ?? [];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍  EPICON Dedup Flush — C-295\n');
  console.log('Step 1: Scanning for dedup/stall keys...\n');

  const patterns = [
    'EPICON_PROMOTED_IDS*',
    'EPICON_PROMOTION_STALL*',
    'EPICON_DEDUP*',
  ];

  const foundKeys: string[] = [];
  for (const pattern of patterns) {
    const keys = await kvKeys(pattern);
    foundKeys.push(...keys);
  }

  const explicitKeys = [
    'EPICON_PROMOTED_IDS',
    'EPICON_PROMOTED_IDS:C-294',
    'EPICON_PROMOTED_IDS:C-293',
    'EPICON_PROMOTION_STALL:C-294',
    'EPICON_PROMOTION_STALL:C-293',
    'epicon:promoted',
    'epicon:promoted:C-294',
    'epicon:dedup',
    'EPICON_CYCLE_PROMOTED',
    'EPICON_CYCLE_PROMOTED:C-294',
  ];

  const allKeys = Array.from(new Set([...foundKeys, ...explicitKeys]));

  console.log(`Found ${foundKeys.length} keys via pattern scan.`);
  console.log(`Checking ${allKeys.length} total keys (pattern + explicit)...\n`);

  console.log('Step 2: Reading key contents before flush...\n');
  const results: { key: string; existed: boolean; type: string; size: number; action: string }[] = [];

  for (const key of allKeys) {
    const value = await kvGet(key);
    if (value === null) {
      results.push({ key, existed: false, type: 'none', size: 0, action: 'skip' });
      continue;
    }

    let type: string = typeof value;
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

  const existing = results.filter((r) => r.existed);
  if (existing.length === 0) {
    console.log('⚠️   No dedup keys found in KV.');
    console.log('    This means either:');
    console.log('    a) The key names used in production differ from expected patterns');
    console.log('    b) Keys already expired');
    console.log('    c) The promote route stores dedup state differently (e.g. inside a larger state object)\n');
    console.log('    → Check ECHO_STATE, EPICON_STATE, or LEDGER_STATE keys for embedded dedup sets.\n');
  } else {
    console.log('Keys found:\n');
    for (const r of existing) {
      console.log(`  📦  ${r.key}`);
      console.log(`      type=${r.type}  size=${r.size} ${r.type === 'array' ? 'items' : r.type === 'object' ? 'entries' : ''}`);
    }
    console.log('');
  }

  console.log('Step 3: Checking ECHO_STATE for embedded promoted set...\n');
  const echoState = (await kvGet('ECHO_STATE')) as Record<string, unknown> | null;
  if (echoState && typeof echoState === 'object') {
    const dedupKeys = Object.keys(echoState).filter((k) =>
      k.toLowerCase().includes('dedup') ||
      k.toLowerCase().includes('promoted') ||
      k.toLowerCase().includes('suppress')
    );
    if (dedupKeys.length > 0) {
      console.log(`  Found dedup-related fields in ECHO_STATE: ${dedupKeys.join(', ')}`);
      for (const dk of dedupKeys) {
        const val = echoState[dk];
        const size = Array.isArray(val)
          ? (val as unknown[]).length
          : typeof val === 'object' && val
            ? Object.keys(val as object).length
            : 1;
        console.log(`    ${dk}: ${size} entries`);
      }
      console.log('');
    } else {
      console.log('  No embedded dedup fields in ECHO_STATE.\n');
    }
  } else {
    console.log('  ECHO_STATE not found or empty.\n');
  }

  for (const stateKey of ['EPICON_STATE', 'LEDGER_STATE', 'EPICON_CYCLE_STATE:C-294', 'EPICON_INGEST_STATE']) {
    const val = (await kvGet(stateKey)) as Record<string, unknown> | null;
    if (!val) continue;
    const promotedField = Object.keys(val).find((k) =>
      k.toLowerCase().includes('promoted') || k.toLowerCase().includes('dedup')
    );
    if (promotedField) {
      const fieldVal = val[promotedField];
      const size = Array.isArray(fieldVal)
        ? (fieldVal as unknown[]).length
        : typeof fieldVal === 'object' && fieldVal
          ? Object.keys(fieldVal as object).length
          : 1;
      console.log(`  ⚠️  Found "${promotedField}" (${size} entries) inside ${stateKey}`);
      console.log('      → This is likely the active dedup set. Needs in-place mutation, not key delete.\n');
      results.push({ key: `${stateKey}.${promotedField}`, existed: true, type: 'embedded', size, action: 'report' });
    }
  }

  console.log('Step 4: Deleting standalone dedup keys...\n');
  let deletedCount = 0;
  let notFoundCount = 0;

  for (const r of results.filter((r) => r.existed && r.action === 'pending')) {
    const outcome = await kvDel(r.key);
    r.action = outcome;
    if (outcome === 'deleted') {
      deletedCount++;
      console.log(`  ✅  deleted  ${r.key}  (was ${r.type}, ${r.size} entries)`);
    } else {
      notFoundCount++;
      console.log(`  ○   skipped  ${r.key}  (already gone)`);
    }
  }

  if (deletedCount === 0 && existing.length === 0) {
    console.log('  Nothing to delete.\n');
  }

  console.log('\nStep 5: Verifying promotion lane via live endpoint...\n');
  try {
    const res = await fetch('https://mobius-civic-ai-terminal.vercel.app/api/epicon/promote');
    const data = (await res.json()) as {
      diagnostics?: {
        promoter_eligible_count?: number;
        promoter_excluded_reasons?: Record<string, number>;
        promoter_input_count?: number;
      };
      counters?: { pending_promotable_count?: number };
    };

    const diag = data?.diagnostics;
    const alreadyPromoted = diag?.promoter_excluded_reasons?.already_promoted ?? 'unknown';
    const eligible = diag?.promoter_eligible_count ?? 'unknown';
    const input = diag?.promoter_input_count ?? 'unknown';
    const pending = data?.counters?.pending_promotable_count ?? 'unknown';

    console.log(`  input:           ${input}`);
    console.log(`  eligible:        ${eligible}`);
    console.log(`  already_promoted: ${alreadyPromoted}`);
    console.log(`  pending:         ${pending}`);

    if (alreadyPromoted === 0 || (typeof alreadyPromoted === 'number' && typeof input === 'number' && alreadyPromoted < input)) {
      console.log('\n  ✅  PROMOTION LANE UNBLOCKED — already_promoted is 0 or reduced.');
    } else if (alreadyPromoted === input) {
      console.log('\n  ⚠️   Lane still blocked (already_promoted = input).');
      console.log('      The dedup set is likely embedded inside a state object, not a standalone key.');
      console.log('      Check ECHO_STATE or EPICON_INGEST_STATE for an embedded "promoted_ids" field.');
      console.log('      You will need to patch the route to clear the embedded set and redeploy.');
    } else {
      console.log('\n  🟡  Partial improvement — some items still blocked.');
    }
  } catch (err) {
    console.log(`  ❌  Could not reach promote endpoint: ${err}`);
  }

  console.log('\n── Summary ───────────────────────────────────────────────────────────');
  console.log(`  Keys deleted:    ${deletedCount}`);
  console.log(`  Keys not found:  ${results.filter((r) => !r.existed).length}`);
  console.log(`  Embedded dedup:  ${results.filter((r) => r.action === 'report').length > 0 ? 'found (see above)' : 'none detected'}`);
  console.log('──────────────────────────────────────────────────────────────────────\n');

  if (deletedCount === 0 && results.filter((r) => r.action === 'report').length === 0) {
    console.log('Next step: The dedup state may be stored under a non-standard key name.');
    console.log('Run this to scan all EPICON-related keys:');
    console.log('');
    console.log('  npx tsx scripts/flush-epicon-dedup.ts --scan-all');
  }
}

async function scanAll() {
  console.log('\n🔬  Full KV scan for EPICON-related keys...\n');
  const patterns = ['EPICON*', 'epicon*', 'LEDGER*', 'ECHO*', 'PROMOTE*', 'promote*'];
  for (const p of patterns) {
    const keys = await kvKeys(p);
    if (keys.length > 0) {
      console.log(`  ${p}  →  ${keys.length} keys:`);
      for (const k of keys.slice(0, 20)) {
        console.log(`    ${k}`);
      }
      if (keys.length > 20) console.log(`    ... and ${keys.length - 20} more`);
      console.log('');
    }
  }
}

const args = process.argv.slice(2);
if (args.includes('--scan-all')) {
  scanAll().catch(console.error);
} else {
  main().catch(console.error);
}
