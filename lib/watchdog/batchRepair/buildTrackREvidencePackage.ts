import type { CollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks';
import {
  compareAffectedBlockSets,
  hashAffectedBlockNumbers,
} from '@/lib/watchdog/batchRepair/affectedBlockComparison';
import { assessGovernance131Cutoff } from '@/lib/watchdog/batchRepair/governance131Cutoff';
import {
  computeExecutionWitnessHash,
  type ExecutionWitnessRecordResult,
} from '@/lib/watchdog/batchRepair/executionWitnessHash';
import {
  exportAuthenticatedLiveSealWitness,
  redactLiveWitnessComparison,
} from '@/lib/watchdog/batchRepair/liveSealWitnessExport';
import {
  resolveTrackRProcessExitCode,
  type TrackRExecutiveStatus,
} from '@/lib/watchdog/batchRepair/processExitPolicy';
import {
  computeLineageSnapshotHash,
  computeTelemetrySnapshotHash,
} from '@/lib/watchdog/batchRepair/snapshotIdentity';
import { resolveTrackRExecutiveStatus, type DriftItem } from '@/lib/watchdog/batchRepair/trackRExecutiveStatus';
import type { BatchDryRunReport, CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import type { C397Witness } from '@/lib/watchdog/batchRepair/witnessResolution';
import { buildFixtureSealsFromWitness } from '@/lib/watchdog/batchRepair/fixtureSeals';
import type { CollisionResolutionTable } from '@/lib/watchdog/batchRepair/witnessResolution';

export type TrackREvidencePackageInput = {
  capture_id: string;
  captured_at: string;
  environment_identifier: string;
  observed: Record<string, unknown>;
  drift: DriftItem[];
  fetch_failures: string[];
  witness: C397Witness;
  resolution_table: CollisionResolutionTable;
  witness_audit_hash: string;
  resolution_table_hash: string;
  collision_affected_blocks: CollisionAffectedBlockSnapshot | null;
  collision_affected_blocks_source: string | null;
  dryRunOk: boolean;
  dryRunErrors: string[];
  manifest?: CollisionRepairBatchManifest;
  report?: BatchDryRunReport;
  rollback_hash: string | null;
};

export type TrackREvidencePackageResult = {
  executive_status: TrackRExecutiveStatus;
  process_exit_code: number;
  execution_authorized: false;
  lineage_snapshot_hash: string;
  telemetry_snapshot_hash: string;
  execution_witness_hash: string | null;
  affected_block_comparison: ReturnType<typeof compareAffectedBlockSets>;
  live_witness_attempt: Awaited<ReturnType<typeof exportAuthenticatedLiveSealWitness>>;
  governance131: ReturnType<typeof assessGovernance131Cutoff>;
  redacted_witness_comparison: ExecutionWitnessRecordResult[];
  attestation_hashes: {
    semantic_manifest_hash: string | null;
    lineage_snapshot_hash: string;
    execution_witness_hash: string | null;
    rollback_manifest_hash: string | null;
  };
};

export async function buildTrackREvidencePackage(
  input: TrackREvidencePackageInput,
): Promise<TrackREvidencePackageResult> {
  const pinnedBlocks = input.witness.contested_block_numbers;
  const affectedBlockComparison = compareAffectedBlockSets({
    pinned_block_numbers: pinnedBlocks,
    live_snapshot: input.collision_affected_blocks,
    live_source: input.collision_affected_blocks_source,
    collision_pair_count_live: (input.observed.historical_collision_pairs as number | null) ?? null,
  });

  const lineage_snapshot_hash = computeLineageSnapshotHash({
    capture_id: input.capture_id,
    cycle: (input.observed.cycle as string | null) ?? null,
    latest_attested_seal: (input.observed.latest_attested_seal as string | null) ?? null,
    attested_seal_index: (input.observed.attested_seal_index as number | null) ?? null,
    projected_next_sequence: (input.observed.projected_next_sequence as number | null) ?? null,
    historical_collision_pairs: (input.observed.historical_collision_pairs as number | null) ?? null,
    contested_block_positions:
      affectedBlockComparison.live_contested_count ??
      (input.observed.contested_block_positions as number | null) ??
      0,
    uncontested_positions: (input.observed.uncontested_positions as number | null) ?? 0,
    canonical_reserve_blocks: input.observed.canonical_reserve_blocks ?? null,
    integrity_gate_active: input.observed.integrity_gate_active as boolean | null,
    reserve_block_lane: (input.observed.reserve_block_lane as string | null) ?? null,
    candidate_formation_blocked: input.observed.candidate_formation_blocked as boolean | null,
    witness_audit_hash: input.witness_audit_hash,
    resolution_table_hash: input.resolution_table_hash,
    active_lineage_version: null,
    live_canonical_pointer: null,
    pinned_affected_block_numbers_hash: hashAffectedBlockNumbers(pinnedBlocks),
    live_affected_block_numbers_hash: affectedBlockComparison.live_block_numbers
      ? hashAffectedBlockNumbers(affectedBlockComparison.live_block_numbers)
      : null,
    affected_block_set_match: affectedBlockComparison.set_match,
  });

  const telemetry_snapshot_hash = computeTelemetrySnapshotHash({
    capture_id: input.capture_id,
    unsealed_accumulator_mic: (input.observed.unsealed_accumulator_mic as number | null) ?? null,
    gi_current: input.observed.gi_current,
    health_status: input.observed.health_status,
    kv_available: (input.observed.kv_available as boolean | null) ?? null,
    latest_sealed_at: input.observed.latest_sealed_at,
  });

  let liveWitnessAttempt: Awaited<ReturnType<typeof exportAuthenticatedLiveSealWitness>> = {
    ok: false,
    blocked_reason: 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE',
    export: null,
    comparison_results: [],
    verification_errors: ['manifest unavailable for live witness export'],
    expected_universe_count: 0,
    export_source: 'unavailable',
  };

  if (input.manifest) {
    liveWitnessAttempt = await exportAuthenticatedLiveSealWitness({
      capture_id: input.capture_id,
      exported_at: input.captured_at,
      environment_identifier: input.environment_identifier,
      witness: input.witness,
      manifest: input.manifest,
    });
  }

  const fixtureSeals = buildFixtureSealsFromWitness(input.witness, input.resolution_table);
  const governance131 = input.manifest
    ? assessGovernance131Cutoff({
        manifest: input.manifest,
        live_witness_records: liveWitnessAttempt.comparison_results,
        seals_for_boundary_check: fixtureSeals,
        clean_block_numbers: input.witness.clean_block_numbers,
      })
    : {
        ok: false,
        status: 'clarify' as const,
        errors: ['manifest unavailable for governance 131 cutoff assessment'],
        promoted_through_position: 131 as const,
        proposed_latest_canonical_seal_id: 'seal-C-358-131',
        boundary_131_132: 'pending_track_r_step_8' as const,
        positions_132_194_status: 'verified_unattached' as const,
      };

  const executive_status = resolveTrackRExecutiveStatus({
    fetchFailures: input.fetch_failures,
    dryRunOk: input.dryRunOk,
    materialDrift: input.drift.filter((d) => d.severity === 'material'),
    affectedBlockComparison,
    liveWitnessAttempt,
    governance131,
    boundary131Metric: input.report?.metrics.boundary_131_132 ?? 'unknown',
  });

  const redacted_witness_comparison = redactLiveWitnessComparison(
    liveWitnessAttempt.comparison_results,
  );

  const execution_witness_hash =
    input.manifest && liveWitnessAttempt.export?.export_complete
      ? computeExecutionWitnessHash({
          schema_version: '1.0',
          semantic_manifest_hash: input.manifest.manifest_hash,
          source_audit_hash: input.manifest.source_audit_hash,
          lineage_snapshot_hash,
          expected_seal_ids: liveWitnessAttempt.export.expected_seal_ids,
          per_record_results: redacted_witness_comparison,
          live_affected_block_numbers: affectedBlockComparison.live_block_numbers ?? [],
          pinned_affected_block_numbers: pinnedBlocks,
          export_source: liveWitnessAttempt.export_source,
          environment_identifier: input.environment_identifier,
          active_lineage_version: null,
          live_canonical_pointer: null,
        })
      : null;

  return {
    executive_status,
    process_exit_code: resolveTrackRProcessExitCode(executive_status),
    execution_authorized: false,
    lineage_snapshot_hash,
    telemetry_snapshot_hash,
    execution_witness_hash,
    affected_block_comparison: affectedBlockComparison,
    live_witness_attempt: liveWitnessAttempt,
    governance131,
    redacted_witness_comparison,
    attestation_hashes: {
      semantic_manifest_hash: input.manifest?.manifest_hash ?? null,
      lineage_snapshot_hash,
      execution_witness_hash,
      rollback_manifest_hash: input.rollback_hash,
    },
  };
}
