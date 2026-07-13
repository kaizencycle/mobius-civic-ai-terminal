#!/usr/bin/env node
/**
 * C-371 ZEUS cryptographic verification — read-only production API.
 * Walks authoritative legacy IDs + hash-chain forward from seal-C-308-042.
 * Usage: node scripts/c371-zeus-verification.mjs [out.json]
 */
import { writeFileSync } from 'fs';
import { createHash } from 'crypto';

const API = 'https://mobius-civic-ai-terminal.vercel.app';

const LEGACY = [
  'seal-C-288-001', 'seal-C-292-001', 'seal-C-293-001', 'seal-C-294-001', 'seal-C-295-001',
  'seal-C-296-001', 'seal-C-297-001', 'seal-C-298-001', 'seal-C-299-001', 'seal-C-300-002',
  'seal-C-300-003', 'seal-C-300-004', 'seal-C-301-005', 'seal-C-301-006', 'seal-C-301-007',
  'seal-C-302-008', 'seal-C-302-009', 'seal-C-302-010', 'seal-C-302-011', 'seal-C-303-012',
  'seal-C-303-013', 'seal-C-303-014', 'seal-C-303-015', 'seal-C-303-016', 'seal-C-304-017',
  'seal-C-304-018', 'seal-C-304-019', 'seal-C-304-020', 'seal-C-304-021', 'seal-C-304-022',
  'seal-C-304-023', 'seal-C-305-024', 'seal-C-305-025', 'seal-C-305-026', 'seal-C-305-027',
  'seal-C-305-028', 'seal-C-306-029', 'seal-C-306-030', 'seal-C-306-031', 'seal-C-306-032',
  'seal-C-306-033', 'seal-C-306-034', 'seal-C-306-035', 'seal-C-307-036', 'seal-C-307-037',
  'seal-C-307-038', 'seal-C-307-039', 'seal-C-307-040', 'seal-C-307-041',
];

/** May-era attested fragment IDs (blocks 42–131) from C-370 reconciliation checklist. */
const MAY_ERA_KNOWN = [
  'seal-C-308-042', 'seal-C-308-043', 'seal-C-308-044', 'seal-C-308-045', 'seal-C-309-046',
  'seal-C-309-047', 'seal-C-309-048', 'seal-C-309-049', 'seal-C-309-050', 'seal-C-310-051',
  'seal-C-310-052', 'seal-C-310-053', 'seal-C-310-054', 'seal-C-310-055', 'seal-C-310-056',
  'seal-C-310-057', 'seal-C-311-058', 'seal-C-311-059', 'seal-C-311-060', 'seal-C-311-061',
  'seal-C-311-062', 'seal-C-312-063', 'seal-C-312-064', 'seal-C-312-065', 'seal-C-312-066',
  'seal-C-312-067', 'seal-C-312-068', 'seal-C-312-069', 'seal-C-313-070', 'seal-C-313-071',
  'seal-C-313-072', 'seal-C-314-073', 'seal-C-314-074', 'seal-C-314-075', 'seal-C-314-076',
  'seal-C-314-077', 'seal-C-314-078', 'seal-C-314-079', 'seal-C-314-080', 'seal-C-315-081',
  'seal-C-315-082', 'seal-C-315-083', 'seal-C-315-084', 'seal-C-315-085', 'seal-C-315-086',
  'seal-C-315-087', 'seal-C-316-088', 'seal-C-316-089', 'seal-C-316-090', 'seal-C-316-091',
  'seal-C-316-092', 'seal-C-316-093', 'seal-C-317-094', 'seal-C-317-095', 'seal-C-317-096',
  'seal-C-317-097', 'seal-C-317-098', 'seal-C-317-099', 'seal-C-317-100', 'seal-C-317-101',
  'seal-C-317-102', 'seal-C-318-103', 'seal-C-318-104', 'seal-C-318-105', 'seal-C-318-106',
  'seal-C-318-107', 'seal-C-318-108', 'seal-C-318-109', 'seal-C-319-110', 'seal-C-319-111',
  'seal-C-319-112', 'seal-C-319-113', 'seal-C-319-114', 'seal-C-319-115', 'seal-C-319-116',
  'seal-C-320-117', 'seal-C-320-118', 'seal-C-320-119', 'seal-C-320-120', 'seal-C-320-121',
  'seal-C-320-122', 'seal-C-321-123', 'seal-C-321-124', 'seal-C-321-125', 'seal-C-321-126',
  'seal-C-321-127', 'seal-C-321-128', 'seal-C-322-129', 'seal-C-322-130', 'seal-C-322-131',
];

function computeSealHash(s) {
  const canonical = JSON.stringify([
    s.seal_id,
    s.sequence,
    s.cycle_at_seal,
    s.sealed_at,
    s.reserve,
    Number(s.gi_at_seal.toFixed(6)),
    s.mode_at_seal,
    s.source_entries,
    [...s.deposit_hashes].sort(),
    s.prev_seal_hash,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

async function fetchSeal(id) {
  const res = await fetch(`${API}/api/vault/seal/${id}`);
  const d = await res.json();
  if (!d.ok) return null;
  return d;
}

function analyze(d) {
  const s = d.seal;
  const h = computeSealHash(s);
  return {
    seal_id: s.seal_id,
    sequence: s.sequence,
    status: s.status,
    cycle_at_seal: s.cycle_at_seal,
    seal_hash: s.seal_hash,
    prev_seal_hash: s.prev_seal_hash,
    reserve: s.reserve,
    hash_valid: h === s.seal_hash && d.hash_valid === true,
    api_hash_valid: d.hash_valid,
    recompute_match: h === s.seal_hash,
  };
}

function cycleNum(cycle) {
  return parseInt(cycle.replace('C-', ''), 10);
}

/** Discover successor by prev hash: audit index, then cycle-brute IDs. */
async function findSuccessor(cur, auditSeals, cache) {
  const fromAudit = auditSeals.filter((s) => s.prev_seal_hash === cur.seal_hash);
  if (fromAudit.length === 1) return fromAudit[0].seal_id;
  if (fromAudit.length > 1) {
    const bySeq = fromAudit.find((s) => s.sequence === cur.sequence + 1);
    if (bySeq) return bySeq.seal_id;
  }

  const nextSeq = cur.sequence + 1;
  const curCycle = cycleNum(cur.cycle_at_seal);
  const candidates = [];
  for (let c = curCycle; c <= curCycle + 3 && c <= 358; c++) {
    candidates.push(`seal-C-${c}-${String(nextSeq).padStart(3, '0')}`);
  }

  for (const id of candidates) {
    if (cache.has(id)) {
      const s = cache.get(id);
      if (s.prev_seal_hash === cur.seal_hash) return id;
      continue;
    }
    const d = await fetchSeal(id);
    if (!d) continue;
    cache.set(id, d.seal);
    if (d.seal.prev_seal_hash === cur.seal_hash) return id;
  }
  return null;
}

async function walkHashChain(startId, auditSeals, targetTipSeq = 194) {
  const cache = new Map();
  const chain = [];
  let curData = await fetchSeal(startId);
  if (!curData) return { chain, missing_next: startId };

  let cur = curData.seal;
  cache.set(cur.seal_id, cur);
  const seen = new Set();

  while (cur && chain.length < 200) {
    if (seen.has(cur.seal_id)) break;
    seen.add(cur.seal_id);
    chain.push(analyze({ seal: cur, hash_valid: curData.hash_valid }));

    if (cur.sequence >= targetTipSeq) break;

    const nextId = await findSuccessor(cur, auditSeals, cache);
    if (!nextId) return { chain, missing_next: `after-${cur.seal_id}` };

    curData = await fetchSeal(nextId);
    if (!curData) return { chain, missing_next: nextId };
    cur = curData.seal;
    cache.set(cur.seal_id, cur);
  }

  return { chain, missing_next: null };
}

// --- Legacy authoritative list ---
const legacyResults = [];
for (const id of LEGACY) {
  const d = await fetchSeal(id);
  legacyResults.push(d ? analyze(d) : { seal_id: id, status: 'MISSING', hash_valid: false });
}

const listRes = await fetch(`${API}/api/vault/seal?scope=audit&limit=200`);
const listJson = await listRes.json();
const auditSeals = listJson.seals ?? [];

// --- Walk May-era attested fragment ---
const walk = await walkHashChain('seal-C-308-042', auditSeals, 194);
let eraFragment = walk.chain;

// Cross-check known May-era ID list (blocks 42–131)
const mayEraChecks = [];
for (const id of MAY_ERA_KNOWN) {
  const d = await fetchSeal(id);
  mayEraChecks.push({
    seal_id: id,
    present: !!d,
    hash_valid: d ? analyze(d).hash_valid : false,
    in_walk: eraFragment.some((s) => s.seal_id === id),
  });
}

const PRE_CONTINUOUS_GENESIS_COUNT = 8;
const preContinuousGenesis = legacyResults
  .slice(0, PRE_CONTINUOUS_GENESIS_COUNT)
  .filter((s) => s.prev_seal_hash === null);
const genesisRecords = preContinuousGenesis.map((s) => s.seal_id);

const continuousChainRoot = legacyResults[PRE_CONTINUOUS_GENESIS_COUNT];
const continuousChainRootValid =
  continuousChainRoot?.seal_id === 'seal-C-299-001' &&
  continuousChainRoot?.prev_seal_hash === null;
const continuousChainStartLinkOk =
  continuousChainRootValid &&
  legacyResults[PRE_CONTINUOUS_GENESIS_COUNT + 1]?.prev_seal_hash === continuousChainRoot.seal_hash;

let continuousLegacyBreaks = 0;
const legacyLinkIssues = [];
for (let i = PRE_CONTINUOUS_GENESIS_COUNT + 1; i < legacyResults.length; i++) {
  const prev = legacyResults[i - 1];
  const cur = legacyResults[i];
  if (cur.prev_seal_hash !== prev.seal_hash) {
    continuousLegacyBreaks++;
    legacyLinkIssues.push({
      seal_id: cur.seal_id,
      issue: 'predecessor_hash_mismatch',
      expected: prev.seal_hash,
      actual: cur.prev_seal_hash,
    });
  }
}

const b41 = legacyResults.find((s) => s.seal_id === 'seal-C-307-041');
const b42 = eraFragment[0];
const boundaryOk = b41 && b42 && b42.prev_seal_hash === b41.seal_hash;

let eraBreaks = 0;
const eraLinkIssues = [];
for (let i = 1; i < eraFragment.length; i++) {
  if (eraFragment[i].prev_seal_hash !== eraFragment[i - 1].seal_hash) {
    eraBreaks++;
    eraLinkIssues.push({
      seal_id: eraFragment[i].seal_id,
      issue: 'predecessor_hash_mismatch',
      expected: eraFragment[i - 1].seal_hash,
      actual: eraFragment[i].prev_seal_hash,
    });
  }
}

// Duplicate sequence within continuous lineages only (not across independent genesis)
const legacyContinuous = legacyResults.slice(PRE_CONTINUOUS_GENESIS_COUNT);
const duplicateSequences = [];
const seqMap = new Map();
for (const s of [...legacyContinuous, ...eraFragment]) {
  const existing = seqMap.get(s.sequence);
  if (existing && existing.seal_id !== s.seal_id) {
    duplicateSequences.push({ sequence: s.sequence, a: existing.seal_id, b: s.seal_id });
  } else {
    seqMap.set(s.sequence, s);
  }
}

const allVerified = [...legacyResults.filter((s) => s.status !== 'MISSING'), ...eraFragment];
const invalid = allVerified.filter((s) => s.hash_valid === false);

const run2 = {};
for (const id of ['seal-C-288-001', 'seal-C-299-001', 'seal-C-307-041', 'seal-C-308-042', 'seal-C-332-194']) {
  const d = await fetchSeal(id);
  run2[id] = d ? computeSealHash(d.seal) === d.seal.seal_hash : false;
}

const summary = {
  verified_at: new Date().toISOString(),
  agent: 'ZEUS',
  legacy_total: LEGACY.length,
  legacy_present: legacyResults.filter((s) => s.status !== 'MISSING').length,
  era_fragment_walked: eraFragment.length,
  era_fragment_expected: 153,
  era_fragment_complete: eraFragment.length === 153 && eraFragment[eraFragment.length - 1]?.seal_id === 'seal-C-332-194',
  walk_missing_next: walk.missing_next,
  may_era_known_present: mayEraChecks.filter((s) => s.present).length,
  may_era_known_total: MAY_ERA_KNOWN.length,
  hash_valid_total: allVerified.filter((s) => s.hash_valid).length,
  invalid_hashes: invalid.map((s) => s.seal_id),
  genesis_records: genesisRecords,
  continuous_legacy_chain_root: continuousChainRoot?.seal_id ?? null,
  continuous_chain_root_valid: continuousChainRootValid,
  continuous_chain_start_link_ok: continuousChainStartLinkOk,
  continuous_legacy_breaks_pos9_49: continuousLegacyBreaks,
  boundary_41_42: boundaryOk,
  era_fragment_prev_breaks_walk_order: eraBreaks,
  duplicate_sequences_in_continuous_lineages: duplicateSequences,
  run2_spot_check: run2,
  reserve_50_all: allVerified.every((s) => s.reserve === 50 || s.reserve === undefined),
  audit_index_total: listJson.total,
  audit_index_returned: listJson.returned,
};

let zeus_verdict = 'DISPUTED';
if (invalid.length > 0) {
  zeus_verdict = 'QUARANTINE';
} else if (
  boundaryOk &&
  continuousChainRootValid &&
  continuousChainStartLinkOk &&
  continuousLegacyBreaks === 0 &&
  eraBreaks === 0 &&
  duplicateSequences.length === 0 &&
  summary.era_fragment_complete
) {
  zeus_verdict = genesisRecords.length >= PRE_CONTINUOUS_GENESIS_COUNT
    ? 'PASS_WITH_HISTORICAL_GENESIS_SET'
    : 'PASS';
} else if (
  boundaryOk &&
  continuousLegacyBreaks === 0 &&
  eraBreaks === 0 &&
  invalid.length === 0 &&
  !summary.era_fragment_complete
) {
  zeus_verdict = 'DISPUTED';
}

summary.zeus_verdict = zeus_verdict;

const outPath = process.argv[2] ?? '/tmp/zeus-c371-verification.json';
writeFileSync(
  outPath,
  JSON.stringify(
    {
      summary,
      legacyLinkIssues,
      eraLinkIssues,
      mayEraChecks,
      legacyResults,
      eraFragment,
      eraFragmentEnds: eraFragment.slice(-3),
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(summary, null, 2));
