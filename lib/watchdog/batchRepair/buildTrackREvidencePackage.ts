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
  TRACK_R_PRODUCTION_KV_ANCHORS,
  verifyProductionKvEnvironmentIdentity,
  type ProductionKvAnchorInput,
} from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';
import {
  buildProductionKvIdentityReceipt,
  type ProductionApiCrossCheck,
  type ProductionKvIdentityReceipt,
} from '@/lib/watchdog/batchRepair/productionKvIdentityReceipt';
import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';
import { loadAuthoritativeLiveAffectedBlockEvidence } from '@/lib/watchdog/batchRepair/liveAffectedBlockEvidence';
import { loadLiveLineagePointerObservationsPrimaryOnly } from '@/lib/watchdog/batchRepair/liveLineagePointerObservations';
import {
  assessLiveBoundary4142,
  loadLiveSealsForBoundary4142,
} from '@/lib/watchdog/batchRepair/liveBoundaryEvidence';
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
  computeLineageSnapshotHashV2,
  computeTelemetrySnapshotHash,
} from '@/lib/watchdog/batchRepair/snapshotIdentity';
import {
  filterExecutiveMaterialDrift,
  resolveTrackRExecutiveStatus,
  type DriftItem,
} from '@/lib/watchdog/batchRepair/trackRExecutiveStatus';
import type { BatchDryRunReport, CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import type { C397Witness } from '@/lib/watchdog/batchRepair/witnessResolution';
import type { CollisionResolutionTable } from '@/lib/watchdog/batchRepair/witnessResolution';
import type { Seal } from '@/lib/vault-v2/types';

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
  production_kv_anchors?: ProductionKvAnchorInput;
  production_api_base_url?: string | null;
  environment_label?: string;
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
  /**
   * v2 lineage snapshot hash (capture_id/cycle excluded — C-404 CAS-v2
   * repair). Recorded alongside the v1 hash so two production captures can
   * be diffed on v2 material without waiting for a v1 recapture; does not
   * gate `executive_status` or any authorization decision. Null when the
   * live lineage pointer observation could not be read — never a
   * placeholder hash standing in for an unknown pointer state.
   */
  lineage_snapshot_hash_v2: string | null;
  telemetry_snapshot_hash: string;
  execution_witness_hash: string | null;
  affected_block_evidence: Awaited<ReturnType<typeof loadAuthoritativeLiveAffectedBlockEvidence>>;
  affected_block_comparison: ReturnType<typeof compareAffectedBlockSets>;
  live_witness_attempt: Awaited<ReturnType<typeof exportAuthenticatedLiveSealWitness>>;
  live_boundary_41_42: ReturnType<typeof assessLiveBoundary4142>;
  governance131: ReturnType<typeof assessGovernance131Cutoff>;
  redacted_witness_comparison: ExecutionWitnessRecordResult[];
  kv_identity_receipt: ProductionKvIdentityReceipt | null;
  credentials_configured: boolean;
  attestation_hashes: {
    semantic_manifest_hash: string | null;
    lineage_snapshot_hash: string;
    lineage_snapshot_hash_v2: string | null;
    execution_witness_hash: string | null;
    rollback_manifest_hash: string | null;
  };
};

export async function buildTrackREvidencePackage(
  input: TrackREvidencePackageInput,
): Promise<TrackREvidencePackageResult> {
  const pinnedBlocks = input.witness.contested_block_numbers;
  const credentials_configured = hasUpstashKvCredentials();

  let kv_identity_receipt: ProductionKvIdentityReceipt | null = null;
  // v2-only: unlike v1 (which never resolved these and always hashed null —
  // preserved as-is below for Capture #5/#6 compatibility), v2 treats
  // active_lineage_version / live_canonical_pointer as production lineage,
  // so it must hash the real live observation, not a hardcoded null. If the
  // observation can't be read, v2LineagePointersOk stays false and the v2
  // hash is left null rather than silently recording a placeholder that's
  // indistinguishable from a genuine "no active lineage version" state —
  // matching how computeFreshLineageSnapshotFromProduction refuses to hash
  // on the same failure.
  let v2LineagePointersOk = false;
  let v2LineagePointers = { active_lineage_version: null as string | null, live_canonical_pointer: null as string | null };
  if (credentials_configured) {
    const kv_identity = await verifyProductionKvEnvironmentIdentity({
      anchors: input.production_kv_anchors,
    });
    const api_cross_check: ProductionApiCrossCheck = {
      fetched_at: input.captured_at,
      base_url: input.production_api_base_url ?? 'unknown',
      latest_attested_seal: (input.observed.latest_attested_seal as string | null) ?? null,
      attested_seal_index: (input.observed.attested_seal_index as number | null) ?? null,
      historical_collision_pairs: (input.observed.historical_collision_pairs as number | null) ?? null,
      integrity_gate_active: (input.observed.integrity_gate_active as boolean | null) ?? null,
      collision_affected_blocks_present: input.observed.affected_block_numbers != null,
    };
    kv_identity_receipt = buildProductionKvIdentityReceipt({
      environment_label: input.environment_label ?? input.environment_identifier,
      retrieved_at: input.captured_at,
      kv_identity,
      api_cross_check,
    });

    const lineagePointers = await loadLiveLineagePointerObservationsPrimaryOnly();
    v2LineagePointersOk = lineagePointers.ok;
    v2LineagePointers = {
      active_lineage_version: lineagePointers.active_lineage_version,
      live_canonical_pointer: lineagePointers.live_canonical_pointer,
    };
  }

  const affectedBlockEvidence = await loadAuthoritativeLiveAffectedBlockEvidence({
    capture_observed_at: input.captured_at,
    operator_cycle: (input.observed.cycle as string | null) ?? null,
    collision_pair_count_live: (input.observed.historical_collision_pairs as number | null) ?? null,
  });

  const affectedBlockComparison = compareAffectedBlockSets({
    pinned_block_numbers: pinnedBlocks,
    live_snapshot: affectedBlockEvidence.snapshot,
    live_source: affectedBlockEvidence.source,
    capture_observed_at: input.captured_at,
    collision_pair_count_live: (input.observed.historical_collision_pairs as number | null) ?? null,
    operator_cycle: (input.observed.cycle as string | null) ?? null,
  });

  if (!affectedBlockEvidence.snapshot) {
    affectedBlockComparison.errors.push(...affectedBlockEvidence.errors);
    if (affectedBlockEvidence.notes.length > 0) {
      affectedBlockComparison.errors.push(...affectedBlockEvidence.notes);
    }
    affectedBlockComparison.set_match = false;
  } else if (affectedBlockEvidence.notes.length > 0) {
    affectedBlockComparison.errors.push(
      ...affectedBlockEvidence.notes.map((note) => `[info] ${note}`),
    );
  }

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

  // Only compute a v2 hash when the live lineage pointer observation actually
  // succeeded — hashing a placeholder null on a read failure would make that
  // failure indistinguishable from a genuine "no active lineage version"
  // production state, silently defeating the post-merge two-capture compare.
  const lineage_snapshot_hash_v2 = v2LineagePointersOk
    ? computeLineageSnapshotHashV2({
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
        active_lineage_version: v2LineagePointers.active_lineage_version,
        live_canonical_pointer: v2LineagePointers.live_canonical_pointer,
        pinned_affected_block_numbers_hash: hashAffectedBlockNumbers(pinnedBlocks),
        live_affected_block_numbers_hash: affectedBlockComparison.live_block_numbers
          ? hashAffectedBlockNumbers(affectedBlockComparison.live_block_numbers)
          : null,
        affected_block_set_match: affectedBlockComparison.set_match,
      })
    : null;

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
    verification_notes: [],
    production_witness_seal_hash_pin_hash: null,
    production_witness_seal_hash_pin_capture_id: null,
    comparison_mode: 'unavailable',
    expected_universe_count: 0,
    export_source: 'unavailable',
    primary_read_count: 0,
    fallback_read_count: 0,
    uses_fixture_pinned_hashes: false,
    kv_identity_ok: false,
    live_seals: [],
  };

  if (input.manifest) {
    liveWitnessAttempt = await exportAuthenticatedLiveSealWitness({
      capture_id: input.capture_id,
      exported_at: input.captured_at,
      environment_identifier: input.environment_identifier,
      witness: input.witness,
      manifest: input.manifest,
      production_kv_anchors: input.production_kv_anchors ?? TRACK_R_PRODUCTION_KV_ANCHORS,
    });
  }

  const liveBoundarySeals = input.manifest
    ? await loadLiveSealsForBoundary4142({
        manifest: input.manifest,
        witness_live_seals: liveWitnessAttempt.live_seals,
        clean_block_numbers: input.witness.clean_block_numbers,
        kv_identity_ok: liveWitnessAttempt.kv_identity_ok,
      })
    : {
        seals: [] as Seal[],
        block_41_id: null,
        block_42_id: null,
        errors: ['manifest unavailable for live boundary 41->42 assessment'],
      };

  const liveBoundary4142 = input.manifest
    ? assessLiveBoundary4142({
        manifest: input.manifest,
        live_seals: liveBoundarySeals.seals,
        clean_block_numbers: input.witness.clean_block_numbers,
        resolved_block_41_id: liveBoundarySeals.block_41_id,
        resolved_block_42_id: liveBoundarySeals.block_42_id,
        preload_errors: liveBoundarySeals.errors,
      })
    : {
        ok: false,
        status: 'absent' as const,
        errors: ['manifest unavailable for live boundary 41->42 assessment'],
        evidence_source: 'absent' as const,
        canonical_block_41: null,
        canonical_block_42: null,
      };

  const governance131 = input.manifest
    ? assessGovernance131Cutoff({
        manifest: input.manifest,
        live_witness_records: liveWitnessAttempt.comparison_results,
        seals_for_boundary_check: liveWitnessAttempt.live_seals,
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

  const materialDrift = filterExecutiveMaterialDrift(
    input.drift.filter((d) => d.severity === 'material'),
    affectedBlockComparison,
  );

  const executive_status = resolveTrackRExecutiveStatus({
    credentialsConfigured: credentials_configured,
    kvIdentityReceipt: kv_identity_receipt,
    fetchFailures: input.fetch_failures,
    dryRunOk: input.dryRunOk,
    materialDrift,
    affectedBlockComparison,
    liveWitnessAttempt,
    governance131,
    liveBoundary4142,
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
          production_kv_identity_receipt_hash: kv_identity_receipt?.identity_hash ?? null,
          active_lineage_version: null,
          live_canonical_pointer: null,
        })
      : null;

  return {
    executive_status,
    process_exit_code: resolveTrackRProcessExitCode(executive_status),
    execution_authorized: false,
    lineage_snapshot_hash,
    lineage_snapshot_hash_v2,
    telemetry_snapshot_hash,
    execution_witness_hash,
    affected_block_evidence: affectedBlockEvidence,
    affected_block_comparison: affectedBlockComparison,
    live_witness_attempt: liveWitnessAttempt,
    live_boundary_41_42: liveBoundary4142,
    governance131,
    redacted_witness_comparison,
    kv_identity_receipt,
    credentials_configured,
    attestation_hashes: {
      semantic_manifest_hash: input.manifest?.manifest_hash ?? null,
      lineage_snapshot_hash,
      lineage_snapshot_hash_v2,
      execution_witness_hash,
      rollback_manifest_hash: input.rollback_hash,
    },
  };
}
