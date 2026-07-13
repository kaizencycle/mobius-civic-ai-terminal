#!/usr/bin/env node
/**
 * C-371 ECHO storage/index verification — read-only.
 * Usage: node scripts/c371-echo-verification.mjs [out.json]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const API = 'https://mobius-civic-ai-terminal.vercel.app';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const LEGACY = JSON.parse(
  readFileSync(join(REPO_ROOT, 'artifacts/C-371/legacy-mic-tranche-lineage-manifest.json'), 'utf8'),
);

const LEGACY_IDS = [
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

async function fetchSeal(id) {
  const res = await fetch(`${API}/api/vault/seal/${id}`);
  const d = await res.json();
  return { ok: d.ok, status: res.status, seal: d.seal ?? null, hash_valid: d.hash_valid };
}

function substrateArchivePath(id) {
  return join(REPO_ROOT, '../Mobius-Substrate/seals', `${id}.json`);
}

// 1. Wrong ID pattern reproduction
const wrongPatternResults = [];
for (let n = 1; n <= 35; n++) {
  const id = `seal-C-307-${String(n).padStart(3, '0')}`;
  const r = await fetchSeal(id);
  wrongPatternResults.push({ guessed_id: id, http_status: r.status, present: r.ok });
}

// 2. Authoritative legacy direct KV
const legacySurfaces = [];
for (const id of LEGACY_IDS) {
  const kv = await fetchSeal(id);
  const substratePath = substrateArchivePath(id);
  const inSubstrate = existsSync(substratePath);
  legacySurfaces.push({
    seal_id: id,
    kv_direct: kv.ok,
    kv_status: kv.seal?.status ?? null,
    attested_index: kv.seal?.status === 'attested',
    promoted_registry: kv.seal?.status === 'promoted',
    substrate_archive: inSubstrate,
    substrate_status: inSubstrate
      ? JSON.parse(readFileSync(substratePath, 'utf8')).status ?? 'unknown'
      : null,
    surface_mismatch: inSubstrate && kv.ok && kv.seal?.status === 'promoted',
  });
}

// 3. Attested-only index vs promoted predecessor (C-370 false orphan)
// analyzeSealHashLineage only evaluates seals present in its attested input set.
const attestedList = await fetch(`${API}/api/vault/seal?limit=200`);
const attestedJson = await attestedList.json();
const attestedFromIndex = (attestedJson.seals ?? []).filter((s) => s.status === 'attested');
const attestedIds = new Set(attestedFromIndex.map((s) => s.seal_id));
const b42 = await fetchSeal('seal-C-308-042');
const b41 = await fetchSeal('seal-C-307-041');

const CHILD_ID = 'seal-C-308-042';
const childInAttestedDefaultIndex = attestedIds.has(CHILD_ID);

// Build attested-only input: paginated index, plus boundary child if missing from page
// (mirrors lineage audit evaluating a seal that must be in the input set).
const attestedInput = [...attestedFromIndex];
let childInjectedForLineageSim = false;
if (!childInAttestedDefaultIndex && b42.ok && b42.seal?.status === 'attested') {
  attestedInput.push(b42.seal);
  childInjectedForLineageSim = true;
}

const attestedInputIds = new Set(attestedInput.map((s) => s.seal_id));
const attestedByHash = new Map(attestedInput.map((s) => [s.seal_hash, s]));
const childInAttestedInput = attestedInputIds.has(CHILD_ID);
const childSeal = attestedInput.find((s) => s.seal_id === CHILD_ID) ?? b42.seal;

// orphan_prev reproduced only when child is in attested input AND prev hash absent from attested set
// while predecessor body exists in KV (promoted, outside attested index).
const orphanInAttestedOnly =
  childInAttestedInput &&
  childSeal?.prev_seal_hash != null &&
  !attestedByHash.has(childSeal.prev_seal_hash) &&
  b41.ok &&
  b41.seal?.seal_hash === childSeal.prev_seal_hash;

// 4. Audit scope coverage for seq 42-194
const auditList = await fetch(`${API}/api/vault/seal?scope=audit&limit=200`);
const auditJson = await auditList.json();
const auditBySeq = new Map((auditJson.seals ?? []).map((s) => [s.sequence, s]));
const missingFromAuditIndex = [];
for (let seq = 42; seq <= 194; seq++) {
  if (!auditBySeq.has(seq)) missingFromAuditIndex.push(seq);
}

// 5. Key boundary seals
const boundaryResolved = await Promise.all(
  ['seal-C-307-041', 'seal-C-308-042', 'seal-C-332-194'].map(async (id) => {
    const r = await fetchSeal(id);
    return {
      seal_id: id,
      kv_present: r.ok,
      status: r.seal?.status ?? null,
      in_attested_default_index: attestedIds.has(id),
      in_audit_index_sample: (auditJson.seals ?? []).some((s) => s.seal_id === id),
    };
  }),
);

const addressingFalseNegatives = wrongPatternResults.filter((r) => !r.present);
const indexVisibilityFalseNegatives = [
  {
    issue: 'attested_only_orphan_prev',
    seal_id: CHILD_ID,
    reproduced: orphanInAttestedOnly,
    child_in_attested_default_index: childInAttestedDefaultIndex,
    child_injected_for_lineage_sim: childInjectedForLineageSim,
    child_in_attested_input: childInAttestedInput,
    explanation:
      'analyzeSealHashLineage only emits orphan_prev for seals in attested input; predecessor seal-C-307-041 is promoted and excluded from attested-only byHash',
  },
  {
    issue: 'audit_index_incomplete_for_seq_42_194',
    missing_sequence_count: missingFromAuditIndex.length,
    sample_missing: missingFromAuditIndex.slice(0, 15),
    explanation: 'GET /api/vault/seal?scope=audit&limit=200 returns 200 of 356 total; not all seq 42-194 in one page',
  },
];

let echo_verdict = 'STORAGE_CONTINUITY_CONFIRMED';
if (legacySurfaces.some((s) => !s.kv_direct)) {
  echo_verdict = 'TRUE_STORAGE_GAP';
} else if (addressingFalseNegatives.length > 0) {
  echo_verdict = 'ADDRESSING_FAILURE_REPRODUCED';
}
if (orphanInAttestedOnly || missingFromAuditIndex.length > 0) {
  echo_verdict =
    echo_verdict === 'TRUE_STORAGE_GAP' ? echo_verdict : 'INDEX_VISIBILITY_INCOMPLETE';
}

const summary = {
  verified_at: new Date().toISOString(),
  agent: 'ECHO',
  legacy_kv_present: legacySurfaces.filter((s) => s.kv_direct).length,
  legacy_kv_total: LEGACY_IDS.length,
  wrong_pattern_404_count: addressingFalseNegatives.length,
  substrate_archive_count: legacySurfaces.filter((s) => s.substrate_archive).length,
  orphan_prev_reproduced_attested_only: orphanInAttestedOnly,
  child_in_attested_default_index: childInAttestedDefaultIndex,
  child_injected_for_lineage_sim: childInjectedForLineageSim,
  audit_index_missing_seq_count: missingFromAuditIndex.length,
  boundary_checks: boundaryResolved,
  echo_verdict,
};

const outPath = process.argv[2] ?? '/tmp/echo-c371-verification.json';
writeFileSync(
  outPath,
  JSON.stringify(
    {
      summary,
      addressing_false_negatives: addressingFalseNegatives,
      index_visibility_false_negatives: indexVisibilityFalseNegatives,
      legacy_surfaces: legacySurfaces,
      wrong_pattern_sample: wrongPatternResults.slice(0, 5),
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(summary, null, 2));
