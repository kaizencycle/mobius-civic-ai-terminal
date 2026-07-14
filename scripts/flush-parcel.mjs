#!/usr/bin/env node
/**
 * C-372: Flush a sealed journal parcel from Upstash KV to Mobius-Substrate cold canon.
 *
 * Usage:
 *   node scripts/flush-parcel.mjs --seal-id=seal-C-372-002
 *   node scripts/flush-parcel.mjs --seal-id=seal-C-372-002 --dry-run
 *   node scripts/flush-parcel.mjs --seal-id=seal-C-372-002 --prev-hash=000...000
 *
 * Requires: KV_REST_API_* , DAEDALUS_APP_ID , DAEDALUS_APP_KEY
 * Optional: MOBIUS_SUBSTRATE_GITHUB_REPO (default kaizencycle/Mobius-Substrate)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import {
  buildParcelFile,
  formatParcelPath,
  verifyParcelFileContent,
} from './lib/parcel-format.mjs';
import { kvConfigured, kvGet, kvKeys, kvLrange, kvSet } from './lib/upstash-rest.mjs';
import {
  buildFlushIntentBlock,
  createPullRequest,
  ensureBranch,
  getBaseSha,
  getInstallationToken,
  resolvePrevParcelHash,
  putFile,
  substrateRepo,
} from './lib/daedalus-github.mjs';

const GENESIS_AGENTS = ['atlas', 'zeus', 'eve', 'hermes', 'aurea', 'jade', 'daedalus', 'echo'];
const KV_JOURNAL_LIST_READ_MAX = 500;
/** Matches lib/kv/store.ts prefixKey('journal:parcel:chain_tip'). */
const PARCEL_CHAIN_TIP_KEY = 'mobius:journal:parcel:chain_tip';

function parseArgs(argv) {
  const args = {
    sealId: null,
    dryRun: false,
    prevHash: null,
    base: 'main',
    outDir: null,
    openPr: true,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--no-pr') args.openPr = false;
    else if (arg.startsWith('--seal-id=')) args.sealId = arg.split('=')[1];
    else if (arg.startsWith('--prev-hash=')) args.prevHash = arg.split('=')[1];
    else if (arg.startsWith('--base=')) args.base = arg.split('=')[1];
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.split('=')[1];
  }
  if (!args.sealId) {
    console.error('Usage: node scripts/flush-parcel.mjs --seal-id=<seal_id> [--dry-run] [--no-pr]');
    process.exit(2);
  }
  return args;
}

function parseMaybeJson(row) {
  if (typeof row !== 'string') return row ?? null;
  try {
    return JSON.parse(row);
  } catch {
    return null;
  }
}

function asString(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function parseJournalEntry(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const id = asString(candidate.id);
  const agent = asString(candidate.agent).toUpperCase();
  const cycle = asString(candidate.cycle);
  const timestamp = asString(candidate.timestamp);
  const observation = asString(candidate.observation);
  const inference = asString(candidate.inference);
  const recommendation = asString(candidate.recommendation);
  const agentOrigin = asString(candidate.agentOrigin).toUpperCase();
  if (!id || !agent || !cycle || !timestamp || !observation || !inference || !recommendation || !agentOrigin) {
    return null;
  }
  if (candidate.source !== 'agent-journal') return null;
  return { ...candidate, id, agent, cycle, timestamp, agentOrigin };
}

/**
 * Three-strategy KV journal reader (mirrors app/api/agents/journal/route.ts fallback path).
 */
async function loadAllJournalEntries() {
  const indexRows = await kvLrange('agent:journal:index', 0, KV_JOURNAL_LIST_READ_MAX - 1);
  const allRows = await kvLrange('journal:all', 0, KV_JOURNAL_LIST_READ_MAX - 1);
  const agentRows = await Promise.all(
    GENESIS_AGENTS.map((a) => kvLrange(`journal:${a}`, 0, KV_JOURNAL_LIST_READ_MAX - 1)),
  );

  // Prefixed mobius:journal:* scan when primary keys empty
  let extraRows = [];
  const keys = await kvKeys('journal:*', 200);
  if (keys.length === 0) {
    const prefixed = await kvKeys('mobius:journal:*', 200);
    for (const key of prefixed) {
      if (key.endsWith(':index')) continue;
      const rows = await kvLrange(key, 0, KV_JOURNAL_LIST_READ_MAX - 1);
      extraRows.push(...rows);
    }
  } else {
    for (const key of keys) {
      if (key === 'journal:all' || key.endsWith(':index')) continue;
      const rows = await kvLrange(key, 0, KV_JOURNAL_LIST_READ_MAX - 1);
      extraRows.push(...rows);
    }
  }

  const seen = new Set();
  const out = [];
  for (const row of [...indexRows, ...allRows, ...agentRows.flat(), ...extraRows]) {
    const candidate = parseMaybeJson(row);
    const parsed = parseJournalEntry(candidate);
    if (!parsed) continue;
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out;
}

async function loadVaultDeposits() {
  const rows = await kvLrange('vault:deposits', 0, 199);
  const out = [];
  for (const row of rows) {
    const d = parseMaybeJson(row);
    if (!d || typeof d !== 'object') continue;
    if (typeof d.journal_id !== 'string' || typeof d.content_signature !== 'string') continue;
    out.push(d);
  }
  return out;
}

function resolveSealJournalEntries(seal, allEntries, deposits) {
  const sigSet = new Set(seal.deposit_hashes ?? []);
  const journalIds = new Set();
  for (const d of deposits) {
    if (sigSet.has(d.content_signature)) journalIds.add(d.journal_id);
  }

  const byId = new Map(allEntries.map((e) => [e.id, e]));
  const resolved = [];
  for (const jid of journalIds) {
    const entry = byId.get(jid);
    if (entry) resolved.push(entry);
  }

  // Stable ordering: timestamp asc, then id
  resolved.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  return resolved;
}

async function readPrevParcelHashFromRepo(token, baseBranch) {
  const kvTip = await kvGet(PARCEL_CHAIN_TIP_KEY);
  return resolvePrevParcelHash(token, baseBranch, kvTip);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!kvConfigured()) {
    throw new Error('KV REST credentials missing — cannot read seal or journal entries');
  }

  const seal = await kvGet(`vault:seal:${args.sealId}`);
  if (!seal || typeof seal !== 'object') {
    throw new Error(`Seal not found in KV: ${args.sealId}`);
  }
  if (seal.status !== 'attested') {
    throw new Error(`Seal ${args.sealId} status is ${seal.status} — only attested seals may flush`);
  }

  const expectedCount = typeof seal.source_entries === 'number' ? seal.source_entries : seal.deposit_hashes?.length ?? 0;
  if (expectedCount <= 0) {
    throw new Error(`Seal ${args.sealId} has no source_entries — aborting`);
  }

  const [allEntries, deposits] = await Promise.all([loadAllJournalEntries(), loadVaultDeposits()]);
  if (allEntries.length === 0) {
    throw new Error('KV journal read returned zero entries — partial canon forbidden');
  }

  const entries = resolveSealJournalEntries(seal, allEntries, deposits);
  if (entries.length === 0) {
    throw new Error(
      `No journal entries resolved for seal deposit_hashes (${seal.deposit_hashes?.length ?? 0} hashes) — aborting`,
    );
  }
  if (entries.length !== expectedCount) {
    throw new Error(
      `Entry count mismatch: seal.source_entries=${expectedCount} resolved=${entries.length} — partial canon forbidden`,
    );
  }

  let prevParcelHash = args.prevHash;
  let token = null;
  if (!prevParcelHash) {
    token = await getInstallationToken();
    prevParcelHash = await readPrevParcelHashFromRepo(token, args.base);
  }

  const cycle = seal.cycle_at_seal ?? 'unknown';
  const parcelPath = formatParcelPath(cycle, seal.sequence);
  const built = buildParcelFile({
    cycle,
    seal_id: seal.seal_id,
    seal_hash: seal.seal_hash,
    gi_at_seal: seal.gi_at_seal,
    entry_count: expectedCount,
    prev_parcel_hash: prevParcelHash,
    created_at: seal.sealed_at ?? new Date().toISOString(),
    attestations: seal.attestations,
    entries,
  });

  const selfCheck = verifyParcelFileContent(built.fileText);
  if (!selfCheck.ok) {
    throw new Error(`Internal parcel verification failed: ${selfCheck.error}`);
  }

  if (args.outDir) {
    const fullPath = join(args.outDir, parcelPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, built.fileText, 'utf8');
    console.log(JSON.stringify({ ok: true, mode: 'local-write', path: fullPath, parcel_hash: built.parcelHash }, null, 2));
    if (args.dryRun || !args.openPr) return;
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'dry-run',
          repo: substrateRepo(),
          parcel_path: parcelPath,
          entry_count: expectedCount,
          prev_parcel_hash: prevParcelHash,
          parcel_hash: built.parcelHash,
          bytes: Buffer.byteLength(built.fileText, 'utf8'),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!token) token = await getInstallationToken();
  const branch = `flush/${cycle}-parcel-${String(seal.sequence).padStart(3, '0')}`;
  const baseSha = await getBaseSha(token, args.base);
  await ensureBranch(token, branch, baseSha);
  await putFile(token, branch, parcelPath, built.fileText, `canon(${cycle}): journal parcel ${seal.seal_id}`);

  const prBody = buildFlushIntentBlock({
    cycle,
    seal_id: seal.seal_id,
    entry_count: expectedCount,
    parcel_hash: built.parcelHash,
    prev_parcel_hash: prevParcelHash,
  });

  const pr = await createPullRequest(token, {
    title: `canon(${cycle}): journal parcel flush ${seal.seal_id}`,
    head: branch,
    base: args.base,
    body: prBody,
    draft: true,
  });

  await kvSet(PARCEL_CHAIN_TIP_KEY, {
    parcel_hash: built.parcelHash,
    parcel_path: parcelPath,
    seal_id: seal.seal_id,
    branch,
    updated_at: new Date().toISOString(),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        repo: substrateRepo(),
        branch,
        parcel_path: parcelPath,
        pr_number: pr.number,
        pr_url: pr.html_url,
        entry_count: expectedCount,
        parcel_hash: built.parcelHash,
        prev_parcel_hash: prevParcelHash,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error('[flush-parcel] FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
