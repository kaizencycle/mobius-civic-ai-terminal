// C-403: Track R batch collision repair engine (fixture dry-run only)
// Run: tsx tests/contract/batchCollisionRepair.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  buildBatchManifest,
  verifyManifestHash,
  computeManifestHash,
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
  resolveCanonicalSealIdForBlock,
  verifyBoundaryContinuity,
  isDeferredBoundaryEdge,
  TRACK_R_BATCH_REPAIR_ID,
  TRACK_R_CONTESTED_POSITIONS,
  TRACK_R_HISTORICAL_CONFLICT_PAIRS,
  TRACK_R_QUARANTINED_CONFLICTING_SEALS,
  TRACK_R_GOVERNANCE_DISPOSITION,
  computeLineageSnapshotHash,
  computeTelemetrySnapshotHash,
  verifyLiveSealWitnessExport,
  collectTrackRWitnessSealIds,
} from '@/lib/watchdog/batchRepair';
import type { LiveSealWitnessExport } from '@/lib/watchdog/batchRepair/executionWitness';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import type { Seal } from '@/lib/vault-v2/types';
import { verifyKvSnapshotUnchanged, sealReceipt, verifyReceiptHash } from '@/lib/watchdog/reconciliationReceipt';

const FIXTURE_DIR = join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures');
const WITNESS_PATH = join(FIXTURE_DIR, 'C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json');
const TABLE_PATH = join(FIXTURE_DIR, 'C403_COLLISION_RESOLUTION_TABLE.pin.json');
const CREATED_AT = '2026-08-14T00:00:00.000Z';
const PINNED_WITNESS = loadWitnessFromFile(WITNESS_PATH);

function resealManifest(manifest: CollisionRepairBatchManifest): CollisionRepairBatchManifest {
  const { manifest_hash, ...body } = manifest;
  return { ...manifest, manifest_hash: computeManifestHash(body) };
}

const COMMIT_GUARD_BASE = {
  dry_run: false as const,
  execution_feature_flag_enabled: true,
  explicit_operator_command: true,
  fresh_lineage_snapshot_hash_matches: true,
  live_seal_witness_export: null,
  pinned_witness: PINNED_WITNESS,
  integrity_gate_active: true,
  mutation_journal_available: true,
  rollback_plan_verified: true,
};

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
      ...COMMIT_GUARD_BASE,
      manifest,
      approved_manifest_hash: manifest.manifest_hash,
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((e) => e.includes('ZEUS')));
  });

  it('13. missing EVE approval blocks commit', () => {
    const { manifest } = loadFixtures();
    const approved = resealManifest(structuredClone(manifest));
    approved.zeus_verdict = 'approved';
    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest: approved,
      approved_manifest_hash: approved.manifest_hash,
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((e) => e.includes('EVE')));
  });

  it('14. missing human approval blocks commit', () => {
    const { manifest } = loadFixtures();
    const approved = resealManifest(structuredClone(manifest));
    approved.zeus_verdict = 'approved';
    approved.eve_verdict = 'approved';
    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest: approved,
      approved_manifest_hash: approved.manifest_hash,
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((e) => e.includes('human')));
  });

  it('15. wrong manifest hash blocks commit', () => {
    const { manifest } = loadFixtures();
    const approved = resealManifest(structuredClone(manifest));
    approved.zeus_verdict = 'approved';
    approved.eve_verdict = 'approved';
    approved.human_approval = 'approved';
    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest: approved,
      approved_manifest_hash: '0'.repeat(64),
    });
    assert.equal(guard.ok, false);
  });

  it('15b. tampered semantic manifest contents with stale hash blocks commit', () => {
    const { manifest } = loadFixtures();
    const tampered = structuredClone(manifest);
    tampered.canonical_assignments['1'] = 'seal-tampered';
    tampered.zeus_verdict = 'approved';
    tampered.eve_verdict = 'approved';
    tampered.human_approval = 'approved';
    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest: tampered,
      approved_manifest_hash: manifest.manifest_hash,
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((e) => e.includes('tampered manifest contents')));
  });

  it('15c. extra canonical assignment fails validation', () => {
    const { manifest, table } = loadFixtures();
    const tampered = structuredClone(manifest);
    tampered.canonical_assignments['999'] = 'seal-extra';
    const result = validateBatchManifest({ manifest: tampered, resolutionTable: table });
    assert.equal(result.ok, false);
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
    const { manifest, witness } = loadFixtures();
    const store = new InMemoryLineageStore();
    stageVersionedLineage({
      manifest,
      clean_block_numbers: witness.clean_block_numbers,
      derived_latest_canonical_seal_id: null,
      store,
      write: true,
    });
    const first = activateVersionPointer({
      store,
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      expected_active_version: null,
      expected_manifest_hash: manifest.manifest_hash,
    });
    assert.equal(first.ok, true);
    const second = activateVersionPointer({
      store,
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      expected_active_version: TRACK_R_BATCH_REPAIR_ID,
      expected_manifest_hash: manifest.manifest_hash,
    });
    assert.equal(second.ok, true);
    assert.equal(store.get('watchdog:lineage:active_version'), TRACK_R_BATCH_REPAIR_ID);
  });

  it('20. partial staging cannot activate', () => {
    const { manifest } = loadFixtures();
    const store = new InMemoryLineageStore();
    const unstaged = activateVersionPointer({
      store,
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      expected_active_version: null,
      expected_manifest_hash: manifest.manifest_hash,
    });
    assert.equal(unstaged.ok, false);
    assert.ok(unstaged.detail.includes('missing'));

    const result = activateVersionPointer({
      store,
      repair_id: 'partial-version',
      expected_active_version: TRACK_R_BATCH_REPAIR_ID,
      expected_manifest_hash: manifest.manifest_hash,
    });
    assert.equal(result.ok, false);
  });

  it('20b. staged tampered manifest checksum blocks activation', () => {
    const { manifest, witness } = loadFixtures();
    const store = new InMemoryLineageStore();
    stageVersionedLineage({
      manifest,
      clean_block_numbers: witness.clean_block_numbers,
      derived_latest_canonical_seal_id: null,
      store,
      write: true,
    });
    const manifestKey = `watchdog:lineage:version:${TRACK_R_BATCH_REPAIR_ID}:manifest`;
    const raw = store.get(manifestKey)!;
    const tampered = JSON.parse(raw);
    tampered.canonical_assignments['1'] = 'seal-tampered';
    store.set(manifestKey, JSON.stringify(tampered));

    const result = activateVersionPointer({
      store,
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      expected_active_version: null,
      expected_manifest_hash: manifest.manifest_hash,
    });
    assert.equal(result.ok, false);
    assert.ok(result.detail.includes('checksum'));
  });

  it('20c. clean block seal resolved from evidence not hardcoded fixture id', () => {
    const liveLikeSeal: Seal = {
      seal_id: 'seal-C-308-041',
      sequence: 41,
      cycle_at_seal: 'C-308',
      sealed_at: '2026-06-01T00:00:00.000Z',
      reserve: 50,
      gi_at_seal: 0.95,
      mode_at_seal: 'green',
      source_entries: 1,
      deposit_hashes: [],
      attestations: {},
      status: 'attested',
      fountain_status: 'pending',
      fountain_emitted_at: null,
      posture: null,
      seal_hash: 'live-hash-41',
      prev_seal_hash: 'live-hash-40',
    };
    const seals = [liveLikeSeal];
    const id = resolveCanonicalSealIdForBlock({
      block_number: 41,
      canonical_assignments: {},
      seals,
      clean_block_numbers: [41],
    });
    assert.equal(id, 'seal-C-308-041');
  });

  it('20d. deferred 131->132 boundary prev not fabricated in fixtures', () => {
    const { manifest, witness, seals } = loadFixtures();
    assert.equal(isDeferredBoundaryEdge(131, 132), true);
    const block131 = manifest.canonical_assignments['131'];
    const block132 = resolveCanonicalSealIdForBlock({
      block_number: 132,
      canonical_assignments: manifest.canonical_assignments,
      seals,
      clean_block_numbers: witness.clean_block_numbers,
    });
    const seal131 = seals.find((s) => s.seal_id === block131);
    const seal132 = seals.find((s) => s.seal_id === block132);
    assert.ok(seal131 && seal132);
    assert.notEqual(seal132.prev_seal_hash, seal131.seal_hash);
    assert.equal(
      verifyBoundaryContinuity({
        seals,
        canonical_assignments: manifest.canonical_assignments,
        clean_block_numbers: witness.clean_block_numbers,
        from_block: 131,
        to_block: 132,
      }),
      'fail',
    );
  });

  it('21. 41->42 boundary continuity verified from staged seals', async () => {
    const { manifest } = loadFixtures();
    assert.equal(manifest.boundary_expectations['41->42'], 'must_pass');
    const result = await executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    assert.equal(result.ok, true);
    assert.equal(result.report?.metrics.boundary_41_42, 'pass');
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

  it('27. semantic manifest hash stable across different created_at timestamps', () => {
    const { witness, table, seals } = loadFixtures();
    const early = buildBatchManifest({
      witness,
      resolutionTable: table,
      seals,
      created_at: '2026-08-14T00:00:00.000Z',
    });
    const late = buildBatchManifest({
      witness,
      resolutionTable: table,
      seals,
      created_at: '2026-08-14T23:59:59.999Z',
    });
    assert.equal(early.manifest_hash, late.manifest_hash);
    assert.notEqual(early.created_at, late.created_at);
  });

  it('28. attestation verdict changes do not alter semantic manifest hash', () => {
    const { manifest } = loadFixtures();
    const approved = resealManifest(structuredClone(manifest));
    approved.zeus_verdict = 'approved';
    approved.eve_verdict = 'approved';
    approved.human_approval = 'approved';
    assert.equal(approved.manifest_hash, manifest.manifest_hash);
  });

  it('29. governance disposition records 131-only promotion and verified_unattached 132-194', () => {
    const { manifest } = loadFixtures();
    assert.deepEqual(manifest.governance_disposition, TRACK_R_GOVERNANCE_DISPOSITION);
    assert.equal(manifest.governance_disposition.preserved_unattached.status, 'verified_unattached');
    assert.equal(manifest.governance_disposition.boundary_131_132_edge, 'not_fabricated');
  });

  it('30. missing live seal witness export blocks commit', () => {
    const { manifest } = loadFixtures();
    const approved = resealManifest(structuredClone(manifest));
    approved.zeus_verdict = 'approved';
    approved.eve_verdict = 'approved';
    approved.human_approval = 'approved';
    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest: approved,
      approved_manifest_hash: approved.manifest_hash,
      live_seal_witness_export: null,
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((e) => e.includes('live seal witness export')));
  });

  it('30b. empty witness export with export_complete true fails verification', () => {
    const emptyExport: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'capture-empty',
      exported_at: '2026-08-14T00:00:00.000Z',
      authenticated_read: true,
      export_source: 'test',
      expected_seal_ids: [],
      records: [],
      summary: { total: 0, match: 0, mismatch: 0, missing: 0, unexpected: 0 },
      export_complete: true,
    };
    const result = verifyLiveSealWitnessExport(emptyExport);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('expected_seal_ids')));
  });

  it('30c. witness export requires per-record match for expected seal ids', () => {
    const { witness } = loadFixtures();
    const expected = collectTrackRWitnessSealIds(witness).slice(0, 2);
    const exportOk: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'capture-ok',
      exported_at: '2026-08-14T00:00:00.000Z',
      authenticated_read: true,
      export_source: 'test-kv-read',
      expected_seal_ids: expected,
      records: expected.map((seal_id) => ({
        seal_id,
        block_number: null,
        status: 'match' as const,
        pinned_witness_hash: 'hash-a',
        live_kv_hash: 'hash-a',
      })),
      summary: { total: expected.length, match: expected.length, mismatch: 0, missing: 0, unexpected: 0 },
      export_complete: true,
    };
    assert.equal(
      verifyLiveSealWitnessExport(exportOk, { expected_seal_ids: expected }).ok,
      true,
    );
  });

  it('30d. partial witness export cannot clear commit gate', () => {
    const { manifest, witness } = loadFixtures();
    const partial = collectTrackRWitnessSealIds(witness).slice(0, 2);
    const approved = resealManifest(structuredClone(manifest));
    approved.zeus_verdict = 'approved';
    approved.eve_verdict = 'approved';
    approved.human_approval = 'approved';

    const partialExport: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'capture-partial',
      exported_at: '2026-08-14T00:00:00.000Z',
      authenticated_read: true,
      export_source: 'test-kv-read',
      expected_seal_ids: partial,
      records: partial.map((seal_id) => ({
        seal_id,
        block_number: null,
        status: 'match' as const,
        pinned_witness_hash: 'hash-a',
        live_kv_hash: 'hash-a',
      })),
      summary: { total: partial.length, match: partial.length, mismatch: 0, missing: 0, unexpected: 0 },
      export_complete: true,
    };

    assert.equal(verifyLiveSealWitnessExport(partialExport, { expected_seal_ids: partial }).ok, true);

    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest: approved,
      approved_manifest_hash: approved.manifest_hash,
      live_seal_witness_export: partialExport,
      pinned_witness: witness,
    });
    assert.equal(guard.ok, false);
    assert.ok(
      guard.errors.some(
        (e) =>
          e.includes('authoritative pinned witness universe') ||
          e.includes('expected_seal_ids') ||
          e.includes('records.length'),
      ),
    );
  });

  it('31. lineage and telemetry snapshot hashes diverge when accumulator drifts', () => {
    const capture_id = 'capture-test-001';
    const lineageBase = {
      capture_id,
      cycle: 'C-403',
      latest_attested_seal: 'seal-C-372-002',
      attested_seal_index: 360,
      projected_next_sequence: 361,
      historical_collision_pairs: 125,
      contested_block_positions: 123,
      uncontested_positions: 71,
      canonical_reserve_blocks: null,
      integrity_gate_active: true,
      reserve_block_lane: 'integrity_hold',
      candidate_formation_blocked: true,
      witness_audit_hash: 'abc',
      resolution_table_hash: 'def',
      active_lineage_version: null,
      live_canonical_pointer: null,
      pinned_affected_block_numbers_hash: 'pinned-hash',
      live_affected_block_numbers_hash: 'live-hash',
      affected_block_set_match: true,
    };

    const lineageA = computeLineageSnapshotHash(lineageBase);
    const lineageB = computeLineageSnapshotHash(lineageBase);
    assert.equal(lineageA, lineageB);

    const telemetryA = computeTelemetrySnapshotHash({
      capture_id,
      unsealed_accumulator_mic: 2549.119301,
      gi_current: 0.95,
      health_status: 'ok',
      kv_available: true,
      latest_sealed_at: '2026-08-14T17:00:00.000Z',
    });
    const telemetryB = computeTelemetrySnapshotHash({
      capture_id,
      unsealed_accumulator_mic: 2549.713264,
      gi_current: 0.95,
      health_status: 'ok',
      kv_available: true,
      latest_sealed_at: '2026-08-14T17:00:00.000Z',
    });
    assert.notEqual(telemetryA, telemetryB);
    assert.notEqual(lineageA, telemetryA);
  });
});
