// C-403: Track R fail-closed corrections (process exit, affected-block set, witness hash)
// Run: tsx tests/contract/trackRFailClosed.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  compareAffectedBlockSets,
  hashAffectedBlockNumbers,
  resolveTrackRProcessExitCode,
  resolveTrackRExecutiveStatus,
  computeExecutionWitnessHash,
  buildExecutionWitnessHashPayload,
  assessGovernance131Cutoff,
  verifyLiveSealWitnessExport,
  collectTrackRWitnessSealIds,
  manifestUsesFixturePinnedHashes,
  loadWitnessFromFile,
  loadResolutionTableFromFile,
  buildFixtureSealsFromWitness,
  buildBatchManifest,
  executeBatchDryRun,
  TRACK_R_GOVERNANCE_DISPOSITION,
  computeLineageSnapshotHash,
  computeTelemetrySnapshotHash,
} from '@/lib/watchdog/batchRepair';
import type { LiveSealWitnessExport } from '@/lib/watchdog/batchRepair/executionWitness';
import type { CollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks';

const FIXTURE_DIR = join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures');
const WITNESS_PATH = join(FIXTURE_DIR, 'C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json');
const TABLE_PATH = join(FIXTURE_DIR, 'C403_COLLISION_RESOLUTION_TABLE.pin.json');
const CREATED_AT = '2026-08-14T12:00:00.000Z';
const PINNED_WITNESS = loadWitnessFromFile(WITNESS_PATH);

function liveSnapshot(blocks: number[], audited_at = CREATED_AT): CollisionAffectedBlockSnapshot {
  return {
    schema_version: '1.0',
    audited_at,
    operator_cycle: 'C-403',
    hash_divergent_pair_count: 125,
    unique_block_count: blocks.length,
    raw_attested_count: 500,
    affected_block_numbers: blocks,
    three_way_blocks: [],
    seal_count_by_block: Object.fromEntries(blocks.map((b) => [String(b), 2])),
  };
}

function governance131Pass() {
  return {
    ok: true,
    status: 'pass' as const,
    errors: [] as string[],
    promoted_through_position: 131 as const,
    proposed_latest_canonical_seal_id: 'seal-C-358-131',
    boundary_131_132: 'pending_track_r_step_8' as const,
    positions_132_194_status: 'verified_unattached' as const,
  };
}

function affectedBlockComparisonPass() {
  const pinned = PINNED_WITNESS.contested_block_numbers;
  return compareAffectedBlockSets({
    pinned_block_numbers: pinned,
    live_snapshot: liveSnapshot([...pinned]),
    live_source: 'https://example.com/api/vault/status',
    capture_observed_at: CREATED_AT,
    collision_pair_count_live: 125,
    operator_cycle: 'C-403',
  });
}

describe('trackRFailClosed C-403', () => {
  it('process exit: BLOCKED and QUARANTINE return non-zero', () => {
    assert.equal(resolveTrackRProcessExitCode('BLOCKED'), 1);
    assert.equal(resolveTrackRProcessExitCode('QUARANTINE'), 1);
    assert.equal(
      resolveTrackRProcessExitCode('BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE'),
      1,
    );
  });

  it('process exit: CLARIFY and READY_FOR_ZEUS_EVE_REVIEW return zero', () => {
    assert.equal(resolveTrackRProcessExitCode('CLARIFY'), 0);
    assert.equal(resolveTrackRProcessExitCode('READY_FOR_ZEUS_EVE_REVIEW'), 0);
    assert.equal(resolveTrackRProcessExitCode('PASS'), 0);
  });

  it('affected-block: exact set match passes when artifact is fresh', () => {
    const pinned = PINNED_WITNESS.contested_block_numbers;
    const result = compareAffectedBlockSets({
      pinned_block_numbers: pinned,
      live_snapshot: liveSnapshot([...pinned]),
      live_source: 'https://example.com/api/vault/status',
      capture_observed_at: CREATED_AT,
      collision_pair_count_live: 125,
      operator_cycle: 'C-403',
    });
    assert.equal(result.set_match, true);
    assert.equal(result.live_artifact_fresh, true);
    assert.equal(result.live_artifact_stale, false);
    assert.deepEqual(result.missing_from_live, []);
    assert.deepEqual(result.unexpected_in_live, []);
  });

  it('affected-block: stale artifact fails closed even when set would match', () => {
    const pinned = PINNED_WITNESS.contested_block_numbers;
    const result = compareAffectedBlockSets({
      pinned_block_numbers: pinned,
      live_snapshot: liveSnapshot([...pinned], '2026-08-01T00:00:00.000Z'),
      live_source: 'https://example.com/api/vault/status',
      capture_observed_at: CREATED_AT,
      collision_pair_count_live: 125,
      operator_cycle: 'C-403',
    });
    assert.equal(result.set_match, false);
    assert.equal(result.live_artifact_stale, true);
    assert.ok(result.errors.some((e) => e.includes('stale')));
  });

  it('affected-block: missing artifact fails closed', () => {
    const result = compareAffectedBlockSets({
      pinned_block_numbers: PINNED_WITNESS.contested_block_numbers,
      live_snapshot: null,
      live_source: null,
      capture_observed_at: CREATED_AT,
    });
    assert.equal(result.set_match, false);
    assert.ok(result.errors.some((e) => e.includes('missing')));
  });

  it('affected-block: set mismatch returns BLOCKED executive status', () => {
    const pinned = PINNED_WITNESS.contested_block_numbers;
    const tampered = [...pinned.slice(0, pinned.length - 1), 999];
    const comparison = compareAffectedBlockSets({
      pinned_block_numbers: pinned,
      live_snapshot: liveSnapshot(tampered),
      live_source: 'test',
      capture_observed_at: CREATED_AT,
      collision_pair_count_live: 125,
    });
    assert.equal(comparison.set_match, false);
    const status = resolveTrackRExecutiveStatus({
      fetchFailures: [],
      dryRunOk: true,
      materialDrift: [],
      affectedBlockComparison: comparison,
      liveWitnessAttempt: {
        ok: false,
        blocked_reason: 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE',
        export: null,
        comparison_results: [],
        verification_errors: [],
        expected_universe_count: 0,
        export_source: 'test',
        primary_read_count: 0,
        fallback_read_count: 0,
        uses_fixture_pinned_hashes: false,
      },
      governance131: governance131Pass(),
      boundary131Metric: 'pending_track_r_step_8',
    });
    assert.equal(status, 'BLOCKED');
    assert.equal(resolveTrackRProcessExitCode(status), 1);
  });

  it('failed live witness verification returns BLOCKED not CLARIFY', () => {
    const comparison = affectedBlockComparisonPass();
    const status = resolveTrackRExecutiveStatus({
      fetchFailures: [],
      dryRunOk: true,
      materialDrift: [],
      affectedBlockComparison: comparison,
      liveWitnessAttempt: {
        ok: false,
        blocked_reason: null,
        export: {
          schema_version: '1.0',
          capture_id: 'c',
          exported_at: CREATED_AT,
          authenticated_read: true,
          export_source: 'lib/vault-v2/store.getSealsByIdsPrimaryOnly',
          expected_seal_ids: ['seal-C-332-001'],
          records: [
            {
              seal_id: 'seal-C-332-001',
              block_number: 1,
              status: 'missing',
              pinned_witness_hash: null,
              live_kv_hash: null,
            },
          ],
          summary: { total: 1, match: 0, mismatch: 0, missing: 1, unexpected: 0 },
          export_complete: false,
        },
        comparison_results: [],
        verification_errors: ['expected seal seal-C-332-001 must have status match, got missing'],
        expected_universe_count: 248,
        export_source: 'lib/vault-v2/store.getSealsByIdsPrimaryOnly',
        primary_read_count: 0,
        fallback_read_count: 1,
        uses_fixture_pinned_hashes: false,
      },
      governance131: governance131Pass(),
      boundary131Metric: 'pending_track_r_step_8',
    });
    assert.equal(status, 'BLOCKED');
    assert.equal(resolveTrackRProcessExitCode(status), 1);
  });

  it('dry-run manifest fixture hashes are detected and blocked for live witness', () => {
    const witness = PINNED_WITNESS;
    const table = loadResolutionTableFromFile(TABLE_PATH);
    const seals = buildFixtureSealsFromWitness(witness, table);
    const manifest = buildBatchManifest({
      witness,
      resolutionTable: table,
      seals,
      created_at: CREATED_AT,
    });
    assert.equal(manifestUsesFixturePinnedHashes(manifest), true);
  });

  it('witness export: empty export rejected', () => {
    const empty: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'c',
      exported_at: CREATED_AT,
      authenticated_read: true,
      export_source: 'test',
      expected_seal_ids: [],
      records: [],
      summary: { total: 0, match: 0, mismatch: 0, missing: 0, unexpected: 0 },
      export_complete: true,
    };
    assert.equal(verifyLiveSealWitnessExport(empty).ok, false);
  });

  it('witness export: partial universe rejected against authoritative set', () => {
    const expected = collectTrackRWitnessSealIds(PINNED_WITNESS);
    const partial = expected.slice(0, 3);
    const exportPartial: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'c',
      exported_at: CREATED_AT,
      authenticated_read: true,
      export_source: 'test',
      expected_seal_ids: partial,
      records: partial.map((seal_id) => ({
        seal_id,
        block_number: null,
        status: 'match' as const,
        pinned_witness_hash: 'a',
        live_kv_hash: 'a',
      })),
      summary: { total: partial.length, match: partial.length, mismatch: 0, missing: 0, unexpected: 0 },
      export_complete: true,
    };
    assert.equal(
      verifyLiveSealWitnessExport(exportPartial, { expected_seal_ids: expected }).ok,
      false,
    );
  });

  it('witness export: duplicate seal IDs rejected', () => {
    const seal_id = 'seal-C-332-001';
    const dup: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'c',
      exported_at: CREATED_AT,
      authenticated_read: true,
      export_source: 'test',
      expected_seal_ids: [seal_id],
      records: [
        { seal_id, block_number: 1, status: 'match', pinned_witness_hash: 'a', live_kv_hash: 'a' },
        { seal_id, block_number: 1, status: 'match', pinned_witness_hash: 'a', live_kv_hash: 'a' },
      ],
      summary: { total: 2, match: 2, mismatch: 0, missing: 0, unexpected: 0 },
      export_complete: true,
    };
    const result = verifyLiveSealWitnessExport(dup, { expected_seal_ids: [seal_id] });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('duplicate')));
  });

  it('witness export: unexpected record rejected', () => {
    const expected = ['seal-C-332-001'];
    const exportUnexpected: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'c',
      exported_at: CREATED_AT,
      authenticated_read: true,
      export_source: 'test',
      expected_seal_ids: expected,
      records: [
        {
          seal_id: 'seal-C-332-001',
          block_number: 1,
          status: 'match',
          pinned_witness_hash: 'a',
          live_kv_hash: 'a',
        },
        {
          seal_id: 'seal-C-999-999',
          block_number: 999,
          status: 'unexpected',
          pinned_witness_hash: null,
          live_kv_hash: 'b',
        },
      ],
      summary: { total: 2, match: 1, mismatch: 0, missing: 0, unexpected: 1 },
      export_complete: false,
    };
    assert.equal(verifyLiveSealWitnessExport(exportUnexpected, { expected_seal_ids: expected }).ok, false);
  });

  it('witness export: per-record mismatch rejected', () => {
    const seal_id = 'seal-C-332-001';
    const exportMismatch: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'c',
      exported_at: CREATED_AT,
      authenticated_read: true,
      export_source: 'test',
      expected_seal_ids: [seal_id],
      records: [
        {
          seal_id,
          block_number: 1,
          status: 'mismatch',
          pinned_witness_hash: 'a',
          live_kv_hash: 'b',
        },
      ],
      summary: { total: 1, match: 0, mismatch: 1, missing: 0, unexpected: 0 },
      export_complete: false,
    };
    assert.equal(verifyLiveSealWitnessExport(exportMismatch, { expected_seal_ids: [seal_id] }).ok, false);
  });

  it('witness export: self-declared reduced universe rejected', () => {
    const expected = collectTrackRWitnessSealIds(PINNED_WITNESS);
    const reduced = expected.slice(0, 10);
    const exportReduced: LiveSealWitnessExport = {
      schema_version: '1.0',
      capture_id: 'c',
      exported_at: CREATED_AT,
      authenticated_read: true,
      export_source: 'test',
      expected_seal_ids: reduced,
      records: reduced.map((seal_id) => ({
        seal_id,
        block_number: null,
        status: 'match' as const,
        pinned_witness_hash: 'a',
        live_kv_hash: 'a',
      })),
      summary: { total: reduced.length, match: reduced.length, mismatch: 0, missing: 0, unexpected: 0 },
      export_complete: true,
    };
    assert.equal(
      verifyLiveSealWitnessExport(exportReduced, { expected_seal_ids: expected }).ok,
      false,
    );
  });

  it('execution witness hash stable across timestamp in receipt only', () => {
    const expected = collectTrackRWitnessSealIds(PINNED_WITNESS).slice(0, 2);
    const perRecord = expected.map((seal_id) => ({
      seal_id,
      status: 'MATCH' as const,
      block_number: 1,
      live_kv_hash: 'hash-a',
      pinned_witness_hash: 'hash-a',
    }));
    const base = {
      schema_version: '1.0' as const,
      semantic_manifest_hash: 'manifest-hash',
      source_audit_hash: 'audit-hash',
      lineage_snapshot_hash: 'lineage-hash',
      expected_seal_ids: expected,
      per_record_results: perRecord,
      live_affected_block_numbers: PINNED_WITNESS.contested_block_numbers,
      pinned_affected_block_numbers: PINNED_WITNESS.contested_block_numbers,
      export_source: 'test-kv',
      environment_identifier: 'test-env',
      active_lineage_version: null,
      live_canonical_pointer: null,
    };
    const h1 = computeExecutionWitnessHash(base);
    const h2 = computeExecutionWitnessHash(base);
    assert.equal(h1, h2);
    assert.ok(h1.length === 64);
  });

  it('lineage snapshot includes affected-block set fields', () => {
    const pinned = PINNED_WITNESS.contested_block_numbers;
    const lineage = computeLineageSnapshotHash({
      capture_id: 'capture-1',
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
      pinned_affected_block_numbers_hash: hashAffectedBlockNumbers(pinned),
      live_affected_block_numbers_hash: hashAffectedBlockNumbers(pinned),
      affected_block_set_match: true,
    });
    assert.ok(lineage.length === 64);
  });

  it('telemetry drift does not alter lineage snapshot hash', () => {
    const lineageBase = {
      capture_id: 'capture-1',
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
      pinned_affected_block_numbers_hash: 'pinned',
      live_affected_block_numbers_hash: 'live',
      affected_block_set_match: true,
    };
    const lineageA = computeLineageSnapshotHash(lineageBase);
    const telemetryA = computeTelemetrySnapshotHash({
      capture_id: 'capture-1',
      unsealed_accumulator_mic: 2549.1,
      gi_current: 0.81,
      health_status: 'ok',
      kv_available: true,
      latest_sealed_at: null,
    });
    const telemetryB = computeTelemetrySnapshotHash({
      capture_id: 'capture-1',
      unsealed_accumulator_mic: 2555.9,
      gi_current: 0.81,
      health_status: 'ok',
      kv_available: true,
      latest_sealed_at: null,
    });
    assert.notEqual(telemetryA, telemetryB);
    assert.equal(computeLineageSnapshotHash(lineageBase), lineageA);
  });

  it('governance 131 cutoff preserves verified_unattached 132-194', async () => {
    const witness = PINNED_WITNESS;
    const table = loadResolutionTableFromFile(TABLE_PATH);
    const seals = buildFixtureSealsFromWitness(witness, table);
    const manifest = buildBatchManifest({
      witness,
      resolutionTable: table,
      seals,
      created_at: CREATED_AT,
    });
    const assessment = assessGovernance131Cutoff({
      manifest,
      live_witness_records: [],
      seals_for_boundary_check: seals,
      clean_block_numbers: witness.clean_block_numbers,
    });
    assert.equal(assessment.promoted_through_position, 131);
    assert.equal(assessment.positions_132_194_status, 'verified_unattached');
    assert.equal(assessment.boundary_131_132, 'pending_track_r_step_8');
    assert.deepEqual(manifest.governance_disposition, TRACK_R_GOVERNANCE_DISPOSITION);
  });

  it('dry-run executor reports zero writes', async () => {
    const result = await executeBatchDryRun({
      witnessPath: WITNESS_PATH,
      resolutionTablePath: TABLE_PATH,
      created_at: CREATED_AT,
    });
    assert.equal(result.ok, true);
    assert.equal(result.report?.writes_performed, 0);
  });

  it('execution witness hash payload excludes volatile fields', () => {
    const payload = buildExecutionWitnessHashPayload({
      schema_version: '1.0',
      semantic_manifest_hash: 'm',
      source_audit_hash: 's',
      lineage_snapshot_hash: 'l',
      expected_seal_ids: ['seal-a'],
      per_record_results: [
        {
          seal_id: 'seal-a',
          status: 'MATCH',
          block_number: 1,
          live_kv_hash: 'h',
          pinned_witness_hash: 'h',
        },
      ],
      live_affected_block_numbers: [1],
      pinned_affected_block_numbers: [1],
      export_source: 'test',
      environment_identifier: 'env',
      active_lineage_version: null,
      live_canonical_pointer: null,
    });
    assert.equal(Object.hasOwn(payload, 'captured_at'), false);
    assert.equal(Object.hasOwn(payload, 'telemetry_snapshot_hash'), false);
  });
});
