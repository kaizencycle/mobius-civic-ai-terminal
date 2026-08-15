import { join } from 'node:path';
import {
  assertBatchCommitAllowed,
  buildBatchManifest,
  buildFixtureSealsFromWitness,
  buildRollbackPlan,
  computeManifestHash,
  loadResolutionTableFromFile,
  loadWitnessFromFile,
} from '@/lib/watchdog/batchRepair';
import {
  computeFreshLineageSnapshotFromProduction,
  type FreshLineageSnapshotFromProduction,
} from '@/lib/watchdog/batchRepair/computeFreshLineageSnapshotFromProduction';
import { exportAuthenticatedLiveSealWitness } from '@/lib/watchdog/batchRepair/liveSealWitnessExport';
import type { BatchCommitGuardInput, CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import {
  CAPTURE_0123Z_EXPECTED_HASHES,
  CAPTURE_0123Z_ID,
  type TrackRCaptureAttestationCheck,
} from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export const TRACK_R_APPLY_PREFLIGHT_ARCHIVE =
  'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z';

export type BatchApplyPreflightStatus =
  | 'apply_preflight_pass'
  | 'apply_cas_drift'
  | 'apply_blocked'
  | 'apply_credentials_required';

export type BatchApplyPreflightResult = {
  capture_id: string;
  verified_at: string;
  preflight_status: BatchApplyPreflightStatus;
  execution_authorized: false;
  production_mutation_performed: false;
  attested_lineage_snapshot_hash: string;
  fresh_lineage_snapshot_hash: string | null;
  fresh_lineage_snapshot_hash_matches: boolean;
  commit_guard_ok: boolean;
  commit_guard_errors: string[];
  apply_cas: FreshLineageSnapshotFromProduction;
  checks: TrackRCaptureAttestationCheck[];
};

const CAPTURE_MANIFEST_CREATED_AT = '2026-08-15T01:23:42.484Z';

function addCheck(
  checks: TrackRCaptureAttestationCheck[],
  check: string,
  result: TrackRCaptureAttestationCheck['result'],
  detail: string,
): void {
  checks.push({ check, result, detail });
}

export function loadApprovedCaptureManifest(repoRoot?: string): CollisionRepairBatchManifest {
  const root = repoRoot ?? process.cwd();
  const witness = loadWitnessFromFile(
    join(root, 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json'),
  );
  const table = loadResolutionTableFromFile(
    join(root, 'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json'),
  );
  const seals = buildFixtureSealsFromWitness(witness, table);
  const manifest = buildBatchManifest({
    witness,
    resolutionTable: table,
    seals,
    created_at: CAPTURE_MANIFEST_CREATED_AT,
  });
  const approved = {
    ...manifest,
    zeus_verdict: 'approved' as const,
    eve_verdict: 'approved' as const,
    human_approval: 'approved' as const,
    production_execution_enabled: false as const,
  };
  const { manifest_hash: _ignored, ...body } = approved;
  return { ...approved, manifest_hash: computeManifestHash(body) };
}

/** Apply-time CAS re-read — must not reuse readiness CLI output. */
export async function verifyFreshLineageSnapshotAtApply(args?: {
  attestedLineageSnapshotHash?: string;
  verifiedAt?: string;
  baseUrl?: string;
  repoRoot?: string;
}): Promise<FreshLineageSnapshotFromProduction> {
  return computeFreshLineageSnapshotFromProduction({
    attestedLineageSnapshotHash:
      args?.attestedLineageSnapshotHash ?? CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
    captureId: CAPTURE_0123Z_ID,
    verifiedAt: args?.verifiedAt,
    baseUrl: args?.baseUrl,
    repoRoot: args?.repoRoot,
    environment: 'production-batch-apply-cas-recheck',
    checkPrefix: 'apply',
  });
}

export function assertBatchCommitAllowedAtApply(args: {
  guardInput: Omit<BatchCommitGuardInput, 'fresh_lineage_snapshot_hash_matches'>;
  applyCas: FreshLineageSnapshotFromProduction;
}): { ok: boolean; errors: string[] } {
  if (!args.applyCas.fresh_lineage_snapshot_hash_matches) {
    return {
      ok: false,
      errors: [
        'apply-time lineage snapshot hash does not match attestation (production re-read failed CAS)',
      ],
    };
  }

  return assertBatchCommitAllowed({
    ...args.guardInput,
    fresh_lineage_snapshot_hash_matches: args.applyCas.fresh_lineage_snapshot_hash_matches,
  });
}

export async function runBatchApplyPreflight(args?: {
  verifiedAt?: string;
  baseUrl?: string;
  repoRoot?: string;
  explicitOperatorCommand?: boolean;
  requireExecutionFeatureFlag?: boolean;
}): Promise<BatchApplyPreflightResult> {
  const verifiedAt = args?.verifiedAt ?? new Date().toISOString();
  const repoRoot = args?.repoRoot ?? process.cwd();
  const checks: TrackRCaptureAttestationCheck[] = [];
  const attestedLineageSnapshotHash = CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash;

  const applyCas = await verifyFreshLineageSnapshotAtApply({
    attestedLineageSnapshotHash: attestedLineageSnapshotHash,
    verifiedAt,
    baseUrl: args?.baseUrl,
    repoRoot,
  });
  for (const row of applyCas.checks) {
    checks.push(row);
  }

  if (applyCas.checks.some((row) => row.check === 'apply_cas_probe' && row.result === 'fail')) {
    addCheck(checks, 'apply_preflight_summary', 'fail', 'production KV credentials required');
    return {
      capture_id: CAPTURE_0123Z_ID,
      verified_at: verifiedAt,
      preflight_status: 'apply_credentials_required',
      execution_authorized: false,
      production_mutation_performed: false,
      attested_lineage_snapshot_hash: attestedLineageSnapshotHash,
      fresh_lineage_snapshot_hash: applyCas.fresh_lineage_snapshot_hash,
      fresh_lineage_snapshot_hash_matches: false,
      commit_guard_ok: false,
      commit_guard_errors: ['production KV credentials required for apply-time CAS recheck'],
      apply_cas: applyCas,
      checks,
    };
  }

  const manifest = loadApprovedCaptureManifest(repoRoot);
  const witness = loadWitnessFromFile(
    join(repoRoot, 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json'),
  );

  const witnessAttempt = await exportAuthenticatedLiveSealWitness({
    capture_id: CAPTURE_0123Z_ID,
    exported_at: verifiedAt,
    environment_identifier: 'production-batch-apply-preflight-read-only',
    witness,
    manifest,
  });

  addCheck(
    checks,
    'apply_live_witness_export',
    witnessAttempt.ok ? 'pass' : 'fail',
    witnessAttempt.ok
      ? `export_complete=${witnessAttempt.export?.export_complete ?? false}`
      : witnessAttempt.blocked_reason ?? witnessAttempt.verification_errors.join('; '),
  );

  const rollbackPlan = buildRollbackPlan({
    manifest,
    previous_active_version: null,
    previous_latest_pointer: null,
  });

  const guard = assertBatchCommitAllowedAtApply({
    applyCas,
    guardInput: {
      manifest,
      dry_run: false,
      execution_feature_flag_enabled: args?.requireExecutionFeatureFlag ?? false,
      explicit_operator_command: args?.explicitOperatorCommand ?? true,
      approved_manifest_hash: manifest.manifest_hash,
      live_seal_witness_export: witnessAttempt.export,
      pinned_witness: witness,
      integrity_gate_active: true,
      mutation_journal_available: true,
      rollback_plan_verified: rollbackPlan.journals_required,
    },
  });

  addCheck(
    checks,
    'apply_commit_guard',
    guard.ok ? 'pass' : 'fail',
    guard.ok ? 'commit guard preflight pass' : guard.errors.join('; '),
  );

  const hasFail = checks.some((row) => row.result === 'fail');
  let preflight_status: BatchApplyPreflightStatus = 'apply_blocked';
  if (!applyCas.fresh_lineage_snapshot_hash_matches) {
    preflight_status = 'apply_cas_drift';
  } else if (guard.ok && !hasFail) {
    preflight_status = 'apply_preflight_pass';
  }

  addCheck(checks, 'apply_preflight_summary', preflight_status === 'apply_preflight_pass' ? 'pass' : 'fail', preflight_status);

  return {
    capture_id: CAPTURE_0123Z_ID,
    verified_at: verifiedAt,
    preflight_status,
    execution_authorized: false,
    production_mutation_performed: false,
    attested_lineage_snapshot_hash: attestedLineageSnapshotHash,
    fresh_lineage_snapshot_hash: applyCas.fresh_lineage_snapshot_hash,
    fresh_lineage_snapshot_hash_matches: applyCas.fresh_lineage_snapshot_hash_matches,
    commit_guard_ok: guard.ok,
    commit_guard_errors: guard.errors,
    apply_cas: applyCas,
    checks,
  };
}
