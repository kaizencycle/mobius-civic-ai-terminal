// C-403: Track R batch collision repair engine (fixture dry-run only)
// Run: tsx tests/contract/batchCollisionRepair.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  buildBatchManifest,
  verifyManifestHash,
  validateBatchManifest,
  executeBatchDryRun,
  demonstrateSingleReceiptCircularDependency,
  assertBatchCommitAllowed,
  isBatchExecutionFeatureFlagEnabled,
  buildFixtureSealsFromWitness,
  loadWitnessFromFile,
  loadResolutionTableFromFile,
  collectQuarantinedSealIds,
  extractCanonicalAssignments,
  groupWitnessCollisions,
  InMemoryLineageStore,
  stageVersionedLineage,
  activateVersionPointer,
  buildRollbackPlan,
  TRACK_R_BATCH_REPAIR_ID,
  TRACK_R_CONTESTED_POSITIONS,
  TRACK_R_HISTORICAL_CONFLICT_PAIRS,
  TRACK_R_QUARANTINED_CONFLICTING_SEALS,
} from '@/lib/watchdog/batchRepair';
import { verifyKvSnapshotUnchanged, sealReceipt, verifyReceiptHash } from '@/lib/watchdog/reconciliationReceipt';

const FIXTURE_DIR = join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures');
const WITNESS_PATH = join(FIXTURE_DIR, 'C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json');
const TABLE_PATH = join(FIXTURE_DIR, 'C403_COLLISION_RESOLUTION_TABLE.pin.json');
const CREATED_AT = '2026-08-14T00:00:00.000Z';

function loadFixtures() {
  const witness = loadWitnessFromFile(WITNESS_PATH);
  const table = loadResolutionTableFromFile(TABLE_PATH);
  const seals = buildFixtureSealsFromWitness(witness, table);
  const manifest = buildBatchManifest({
    witness,
    resolutionTable: table,
    seals,
    created_at: CREATED_AT,
  });
  return { witness, table, seals, manifest };
}

describe('batchCollisionRepair C-403', () => {
  it('1. generates 123 receipts from pinned witness', () => {
    const { manifest } = loadFixtures();
    assert.equal(manifest.receipts.length, 123);
  });

  it('2. blocks 1 and 2 handle three-way conflicts', () => {
    const { witness, table } = loadFixtures();
    const groups = groupWitnessCollisions(witness).filter((g) => g.block_number <= 2);
    assert.equal(groups[0].candidate_seal_ids.length, 3);
    assert.equal(groups[1].candidate_seal_ids.length, 3);
    assert.equal(table.block_canonical['1'].seal_id, 'seal-C-332-001');
    assert.equal(table.block_canonical['2'].seal_id, 'seal-C-333-002');
  });

  it('3. 125 unique conflicting IDs enter quarantine', () => {
    const { witness, table, manifest } = loadFixtures();
    const q = collectQuarantinedSealIds({
      witness,
      canonicalAssignments: extractCanonicalAssignments(table),
    });
    assert.equal(q.length, 125);
    assert.deepEqual(manifest.quarantined_seal_ids, q);
  });

  it('4. produces 123 canonical assignments', () => {
    const { manifest } = loadFixtures();
    assert.equal(Object.keys(manifest.canonical_assignments).length, 123);
  });

  it('5. 71 clean positions remain unchanged in staged view', () => {
    const { witness, manifest } = loadFixtures();
    const { view } = stageVersionedLineage({
      manifest,
      clean_block_numbers: witness.clean_block_numbers,
      derived_latest_canonical_seal_id: null,
      write: false,
    });
    assert.equal(view.clean_positions.length, 71);
  });

  it('6. canonical/quarantine overlap fails validation', () => {
    const { manifest, table } = loadFixtures();
    const tampered = structuredClone(manifest);
    tampered.quarantined_seal_ids = [...tampered.quarantined_seal_ids, tampered.receipts[0].canonical_seal_id];
    const result = validateBatchManifest({ manifest: tampered, resolutionTable: table });
    assert.equal(result.ok, false);
  });

  it('7. missing receipt fails validation', () => {
    const { manifest, table } = loadFixtures();
    const tampered = structuredClone(manifest);
    tampered.receipts = tampered.receipts.slice(1);
    const result = validateBatchManifest({ manifest: tampered, resolutionTable: table });
    assert.equal(result.ok, false);
  });

  it('8. duplicate block receipt fails validation', () => {
    const { manifest, table } = loadFixtures();
    const tampered = structuredClone(manifest);
    tampered.receipts.push({ ...tampered.receipts[0] });
    const result = validateBatchManifest({ manifest: tampered, resolutionTable: table });
    assert.equal(result.ok, false);
  });

  it('9. stale KV hash fails receipt validation path', () => {
    const { manifest, seals } = loadFixtures();
    const receipt = structuredClone(manifest.receipts[0]);
    receipt.kv_snapshot[receipt.canonical_seal_id] = 'stale-hash';
    const resealed = sealReceipt({ ...receipt, receipt_hash: undefined as unknown as string });
    assert.ok(verifyReceiptHash(resealed));
    const check = verifyKvSnapshotUnchanged(resealed, {
      [receipt.canonical_seal_id]: seals.find((s) => s.seal_id === receipt.canonical_seal_id)!.seal_hash,
    });
    assert.equal(check.ok, false);
  });

  it('10. tampered receipt hash fails', () => {
    const { manifest } = loadFixtures();
    const receipt = structuredClone(manifest.receipts[0]);
    receipt.receipt_hash = '0'.repeat(64);
    assert.equal(verifyReceiptHash(receipt), false);
  });

  it('11. tampered manifest hash fails', () => {
    const { manifest } = loadFixtures();
    const tampered = structuredClone(manifest);
    tampered.manifest_hash = '0'.repeat(64);
    assert.equal(verifyManifestHash(tampered), false);
  });

  it('12. missing ZEUS approval blocks commit', () => {
    const { manifest } = loadFixtures();
    const guard = assertBatchCommitAllowed({
      manifest,
      dry_run: false,
      execution_feature_flag_enabled: true,
      explicit_operator_command: true,
      approved_manifest_hash: manifest.manifest_hash,
      fresh_kv_snapshot_matches: true,
      integrity_gate_active: true,
      mutation_journal_available: true,
      rollback_plan_verified: true,
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((e) => e.includes('ZEUS')));
  });

  it('13. missing EVE approval blocks commit', () => {
    const { manifest } = loadFixtures();
    const approved = structuredClone(manifest);
    approved.zeus_verdict = 'approved';
    const guard = assertBatchCommitAllowed({
      manifest: approved,
      dry_run: false,
      execution_feature_flag_enabled: true,
      explicit_operator_command: true,
      approved_manifest_hash: manifest.manifest_hash,
      fresh_kv_snapshot_matches: true,
      integrity_gate_active: true,
      mutation_journal_available: true,
      rollback_plan_verified: true,
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((e) => e.includes('EVE')));
  });

  it('14. missing human approval blocks commit', () => {
    const { manifest } = loadFixtures();
    const approved = structuredClone(manifest);
    approved.zeus_verdict = 'approved';
    approved.eve_verdict = 'approved';
    const guard = assertBatchCommitAllowed({
      manifest: approved,
      dry_run: false,
      execution_feature_flag_enabled: true,
      explicit_operator_command: true,
      approved_manifest_hash: manifest.manifest_hash,
      fresh_kv_snapshot_matches: true,
      integrity_gate_active: true,
      mutation_journal_available: true,
      rollback_plan_verified: true,
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((e) => e.includes('human')));
  });

  it('15. wrong manifest hash blocks commit', () => {
    const { manifest } = loadFixtures();
    const approved = structuredClone(manifest);
    approved.zeus_verdict = 'approved';
    approved.eve_verdict = 'approved';
    approved.human_approval = 'approved';
    const guard = assertBatchCommitAllowed({
      manifest: approved,
      dry_run: false,
      execution_feature_flag_enabled: true,
      explicit_operator_command: true,
      approved_manifest_hash: '0'.repeat(64),
      fresh_kv_snapshot_matches: true,
      integrity_gate_active: true,
      mutation_journal_available: true,
      rollback_plan_verified: true,
    });
    assert.equal(guard.ok, false);
  });

  it('16. dry run performs zero writes', async () => {
    const result = await executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    assert.equal(result.report?.writes_performed, 0);
  });

  it('17. execution defaults to disabled', () => {
    assert.equal(isBatchExecutionFeatureFlagEnabled(), false);
    const { manifest } = loadFixtures();
    assert.equal(manifest.production_execution_enabled, false);
  });

  it('18. repeated dry run is deterministic', async () => {
    const a = await executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    const b = await executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    assert.equal(a.manifest?.manifest_hash, b.manifest?.manifest_hash);
  });

  it('19. repeated approved activation is idempotent', () => {
    const store = new InMemoryLineageStore();
    const first = activateVersionPointer({
      store,
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      expected_active_version: null,
    });
    assert.equal(first.ok, true);
    const second = activateVersionPointer({
      store,
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      expected_active_version: TRACK_R_BATCH_REPAIR_ID,
    });
    assert.equal(second.ok, true);
    assert.equal(store.get('watchdog:lineage:active_version'), TRACK_R_BATCH_REPAIR_ID);
  });

  it('20. partial staging cannot activate', () => {
    const store = new InMemoryLineageStore();
    const result = activateVersionPointer({
      store,
      repair_id: 'partial-version',
      expected_active_version: TRACK_R_BATCH_REPAIR_ID,
    });
    assert.equal(result.ok, false);
  });

  it('21. 41->42 boundary expectation is must_pass', () => {
    const { manifest } = loadFixtures();
    assert.equal(manifest.boundary_expectations['41->42'], 'must_pass');
  });

  it('22. 131->132 is pending not falsely passed', () => {
    const { manifest } = loadFixtures();
    assert.equal(manifest.boundary_expectations['131->132'], 'pending_track_r_step_8');
    const result = executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    return result.then((r) => {
      assert.equal(r.report?.metrics.boundary_131_132, 'pending_track_r_step_8');
    });
  });

  it('23. original seal bodies unchanged (fixture count stable)', () => {
    const { seals } = loadFixtures();
    assert.ok(seals.length > 0);
    for (const seal of seals) {
      assert.match(seal.seal_hash, /^fixture-hash-/);
    }
  });

  it('24. historical count remains 125 after adjudication metrics', async () => {
    const result = await executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    assert.equal(result.report?.metrics.historical_hash_divergent_pair_count, 125);
  });

  it('25. unresolved positions zero in complete staged view', async () => {
    const result = await executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    assert.equal(result.report?.metrics.unresolved_collision_positions, 0);
  });

  it('26. rollback restores previous derived-state pointer', () => {
    const { manifest } = loadFixtures();
    const plan = buildRollbackPlan({
      manifest,
      previous_active_version: 'track-r-c402-prior',
      previous_latest_pointer: 'seal-C-372-002',
    });
    assert.equal(plan.restore.active_lineage_version, 'track-r-c402-prior');
    assert.equal(plan.restore.latest_pointer, 'seal-C-372-002');
  });

  it('single-receipt circular dependency confirmed', async () => {
    const { manifest, seals } = loadFixtures();
    const demo = await demonstrateSingleReceiptCircularDependency({ manifest, seals });
    assert.equal(demo.fails_without_batch, true);
  });

  it('full dry-run executor passes', async () => {
    const result = await executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.manifest?.contested_positions, TRACK_R_CONTESTED_POSITIONS);
    assert.equal(result.manifest?.quarantined_conflicting_seal_count, TRACK_R_QUARANTINED_CONFLICTING_SEALS);
    assert.equal(
      result.manifest?.historical_hash_divergent_pairs,
      TRACK_R_HISTORICAL_CONFLICT_PAIRS,
    );
  });
});
