import { join } from 'node:path';
import { loadApprovedCaptureManifest } from '@/lib/watchdog/batchRepair/runBatchApplyPreflight';
import { runBatchApply } from '@/lib/watchdog/batchRepair/runBatchApply';
import { runBatchApplyPreflight } from '@/lib/watchdog/batchRepair/runBatchApplyPreflight';
import { verifyTrackRExecutionReadiness } from '@/lib/watchdog/batchRepair/verifyTrackRExecutionReadiness';
import {
  observeProductionDeploymentCommit,
  assertProductionCommitBinding,
} from '@/lib/watchdog/batchRepair/productionDeploymentBinding';
import {
  assertAffectedBlockSetAligned,
  assertApplyModeRejected,
  assertApplyPreflightPass,
  assertAwaitingExecutionHandoff,
  assertBoundary131Unresolved,
  assertCaptureNineBinding,
  assertDuplicateJournalIdRejected,
  assertFreshCasMatch,
  assertLockedHashBinding,
  assertMutationJournalComplete,
  assertP3DryRunModeExplicit,
  assertProductionWriteEnvAbsent,
  assertReadinessDoesNotAuthorizeExecution,
  assertSignedHandoffNotConsumed,
  assertSkipCasProbeRejectedForProduction,
  assertZeroProductionWrites,
  P3_PREPARATION_DRY_RUN_MODE,
} from '@/lib/watchdog/batchRepair/p3PreparationSafety';
import {
  buildP3OperatorPacket,
  renderP3OperatorPacketMarkdown,
  type P3OperatorPacket,
} from '@/lib/watchdog/batchRepair/buildP3OperatorPacket';
import { loadWitnessFromFile } from '@/lib/watchdog/batchRepair';
import { resolveTrackRCaptureBinding } from '@/lib/watchdog/batchRepair/trackRCaptureBinding';
import type { TrackRCaptureAttestationCheck } from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export type P3PreparationStatus = 'p3_preparation_pass' | 'p3_preparation_blocked';

export type P3PreparationResult = {
  status: P3PreparationStatus;
  verified_at: string;
  capture_id: string;
  checked_out_commit: string;
  observed_production_commit: string | null;
  production_commit_match: boolean;
  readiness_status: string | null;
  preflight_status: string | null;
  batch_apply_status: string | null;
  fresh_cas_match: boolean | null;
  commit_guard_ok: boolean;
  writes_planned: number;
  writes_performed: number;
  rollback_plan_verified: boolean;
  execution_authorized: false;
  production_mutation_performed: false;
  operator_packet: P3OperatorPacket | null;
  operator_packet_markdown: string | null;
  checks: TrackRCaptureAttestationCheck[];
  errors: string[];
};

function addCheck(
  checks: TrackRCaptureAttestationCheck[],
  check: string,
  result: TrackRCaptureAttestationCheck['result'],
  detail: string,
): void {
  checks.push({ check, result, detail });
}

export async function runTrackRP3Preparation(args: {
  baseUrl: string;
  captureId: string;
  checkedOutCommit: string;
  workflowRunId: string;
  dryRunMode: string;
  apply?: boolean;
  skipCasProbe?: boolean;
  repoRoot?: string;
  verifiedAt?: string;
  issuedJournalIds?: Set<string>;
  requireProductionCommitMatch?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<P3PreparationResult> {
  const verifiedAt = args.verifiedAt ?? new Date().toISOString();
  const repoRoot = args.repoRoot ?? process.cwd();
  const checks: TrackRCaptureAttestationCheck[] = [];
  const errors: string[] = [];

  const safetyChecks = [
    assertP3DryRunModeExplicit(args.dryRunMode),
    assertApplyModeRejected(args.apply),
    assertSkipCasProbeRejectedForProduction(args.skipCasProbe),
    assertProductionWriteEnvAbsent(),
    assertSignedHandoffNotConsumed({ repoRoot }),
    assertCaptureNineBinding(args.captureId),
  ];

  for (const row of safetyChecks) {
    const label =
      row === safetyChecks[0]
        ? 'p3_dry_run_mode'
        : row === safetyChecks[1]
          ? 'p3_apply_rejected'
          : row === safetyChecks[2]
            ? 'p3_skip_cas_probe_rejected'
            : row === safetyChecks[3]
              ? 'p3_production_write_env_absent'
              : row === safetyChecks[4]
                ? 'p3_signed_handoff_not_consumed'
                : 'p3_capture_nine_binding';
    addCheck(checks, label, row.ok ? 'pass' : 'fail', row.errors.join('; ') || 'ok');
    errors.push(...row.errors);
  }

  const deployment = await observeProductionDeploymentCommit({
    baseUrl: args.baseUrl,
    observedAt: verifiedAt,
    fetchImpl: args.fetchImpl,
  });
  addCheck(
    checks,
    'production_deployment_binding',
    deployment.bindable ? 'pass' : 'fail',
    deployment.commit_sha ?? deployment.errors.join('; '),
  );
  errors.push(...deployment.errors);

  const commitBinding = assertProductionCommitBinding({
    checkedOutCommit: args.checkedOutCommit,
    observedProductionCommit: deployment.commit_sha,
    requireMatch: args.requireProductionCommitMatch ?? true,
  });
  addCheck(
    checks,
    'production_commit_match',
    commitBinding.ok ? 'pass' : 'fail',
    commitBinding.errors.join('; ') || `${args.checkedOutCommit} == ${deployment.commit_sha}`,
  );
  errors.push(...commitBinding.errors);

  const readiness = await verifyTrackRExecutionReadiness({
    baseUrl: args.baseUrl,
    captureId: args.captureId,
    verifiedAt,
    probeFreshCas: true,
  });
  for (const row of readiness.checks) {
    checks.push(row);
  }
  addCheck(checks, 'readiness_status', 'pass', readiness.readiness_status);
  errors.push(
    ...assertAwaitingExecutionHandoff(readiness.readiness_status).errors,
    ...assertReadinessDoesNotAuthorizeExecution({
      readinessStatus: readiness.readiness_status,
      executionAuthorized: readiness.execution_authorized,
    }).errors,
    ...assertFreshCasMatch(readiness.fresh_cas_match).errors,
  );
  addCheck(
    checks,
    'fresh_cas_match_readiness',
    readiness.fresh_cas_match === true ? 'pass' : 'fail',
    String(readiness.fresh_cas_match),
  );

  const preflight = await runBatchApplyPreflight({
    baseUrl: args.baseUrl,
    captureId: args.captureId,
    verifiedAt,
    repoRoot,
    explicitOperatorCommand: true,
  });
  for (const row of preflight.checks) {
    checks.push(row);
  }
  addCheck(checks, 'apply_preflight_status', 'pass', preflight.preflight_status);
  errors.push(...assertApplyPreflightPass(preflight.preflight_status).errors);
  errors.push(
    ...assertAffectedBlockSetAligned(preflight.apply_cas.checks).errors,
    ...assertAffectedBlockSetAligned(readiness.checks).errors,
  );

  const batchApply = await runBatchApply({
    baseUrl: args.baseUrl,
    captureId: args.captureId,
    verifiedAt,
    repoRoot,
    apply: false,
    skipCasProbe: false,
    explicitOperatorCommand: true,
  });
  for (const row of batchApply.checks) {
    checks.push(row);
  }
  addCheck(checks, 'batch_apply_dry_run', 'pass', batchApply.apply_status);
  errors.push(...assertZeroProductionWrites(batchApply.writes_performed).errors);

  const manifest = loadApprovedCaptureManifest(repoRoot);
  const binding = resolveTrackRCaptureBinding({ captureId: args.captureId, repoRoot });
  const bindingCheck = assertLockedHashBinding({
    semantic_manifest_hash: binding.attestation_hashes.semantic_manifest_hash,
    lineage_snapshot_hash: binding.attestation_hashes.lineage_snapshot_hash,
    execution_witness_hash: binding.attestation_hashes.execution_witness_hash,
    rollback_manifest_hash: binding.attestation_hashes.rollback_manifest_hash,
  });
  addCheck(
    checks,
    'locked_hash_binding',
    bindingCheck.ok ? 'pass' : 'fail',
    bindingCheck.errors.join('; ') || 'Capture #9 hashes aligned',
  );
  errors.push(...bindingCheck.errors);

  if (batchApply.fresh_cas_match === false) {
    errors.push('CAS drift detected at batch apply dry-run boundary');
    addCheck(checks, 'batch_apply_cas_drift', 'fail', 'fresh_cas_match false');
  } else {
    addCheck(checks, 'batch_apply_cas_drift', 'pass', String(batchApply.fresh_cas_match));
  }

  if (!preflight.commit_guard_ok || !batchApply.commit_guard_ok) {
    errors.push('commit guard must pass for P3 preparation');
    addCheck(checks, 'commit_guard_pass', 'fail', 'commit guard failed');
  } else {
    addCheck(checks, 'commit_guard_pass', 'pass', 'commit guard pass');
  }

  if (batchApply.apply_status !== 'dry_run_pass') {
    errors.push(`batch apply dry-run must pass; got ${batchApply.apply_status}`);
  }

  const boundary = assertBoundary131Unresolved(manifest);
  addCheck(
    checks,
    'boundary_131_unresolved',
    boundary.ok ? 'pass' : 'fail',
    boundary.errors.join('; ') || '131→132 pending; slot 361 excluded',
  );
  errors.push(...boundary.errors);

  const journalCheck = assertMutationJournalComplete(batchApply.mutation_journal);
  addCheck(
    checks,
    'mutation_journal_complete',
    journalCheck.ok ? 'pass' : 'fail',
    journalCheck.errors.join('; ') || (batchApply.mutation_journal?.journal_id ?? 'missing'),
  );
  errors.push(...journalCheck.errors);

  if (batchApply.mutation_journal) {
    const duplicate = assertDuplicateJournalIdRejected({
      journalId: batchApply.mutation_journal.journal_id,
      issuedJournalIds: args.issuedJournalIds ?? new Set<string>(),
    });
    addCheck(
      checks,
      'journal_id_unique',
      duplicate.ok ? 'pass' : 'fail',
      duplicate.errors.join('; ') || batchApply.mutation_journal.journal_id,
    );
    errors.push(...duplicate.errors);
  }

  if (!batchApply.rollback_plan_verified) {
    errors.push('rollback plan verification failed');
    addCheck(checks, 'rollback_plan_verified', 'fail', 'rollback plan not verified');
  } else {
    addCheck(checks, 'rollback_plan_verified', 'pass', 'rollback plan verified');
  }

  const witnessPath = join(
    repoRoot,
    'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json',
  );
  const witness = loadWitnessFromFile(witnessPath);
  const intendedBlocks = [...witness.contested_block_numbers].sort((a, b) => a - b);

  let operatorPacket: P3OperatorPacket | null = null;
  let operatorPacketMarkdown: string | null = null;

  if (
    errors.length === 0 &&
    batchApply.mutation_journal &&
    batchApply.apply_status === 'dry_run_pass'
  ) {
    operatorPacket = buildP3OperatorPacket({
      workflowRunId: args.workflowRunId,
      timestamp: verifiedAt,
      checkedOutCommit: args.checkedOutCommit,
      observedProductionCommit: deployment.commit_sha,
      captureId: args.captureId,
      mutationJournal: batchApply.mutation_journal,
      intendedWriteCount: batchApply.writes_planned,
      intendedBlockNumbers: intendedBlocks,
      beforeActiveVersion: null,
      afterActiveVersion: manifest.repair_id,
      writeRecords: batchApply.write_records,
      rollbackVerified: batchApply.rollback_plan_verified,
      rollbackDetail: batchApply.rollback_plan_verified ? 'rollback plan verified' : 'failed',
      readinessStatus: readiness.readiness_status,
      preflightStatus: preflight.preflight_status,
      batchApplyStatus: batchApply.apply_status,
      freshCasMatch: readiness.fresh_cas_match,
      commitGuardOk: preflight.commit_guard_ok && batchApply.commit_guard_ok,
      checks,
    });
    operatorPacketMarkdown = renderP3OperatorPacketMarkdown(operatorPacket);
  }

  const status: P3PreparationStatus =
    errors.length === 0 && operatorPacket !== null ? 'p3_preparation_pass' : 'p3_preparation_blocked';

  addCheck(checks, 'p3_preparation_summary', status === 'p3_preparation_pass' ? 'pass' : 'fail', status);

  return {
    status,
    verified_at: verifiedAt,
    capture_id: args.captureId,
    checked_out_commit: args.checkedOutCommit,
    observed_production_commit: deployment.commit_sha,
    production_commit_match:
      deployment.commit_sha !== null && args.checkedOutCommit === deployment.commit_sha,
    readiness_status: readiness.readiness_status,
    preflight_status: preflight.preflight_status,
    batch_apply_status: batchApply.apply_status,
    fresh_cas_match: readiness.fresh_cas_match,
    commit_guard_ok: preflight.commit_guard_ok && batchApply.commit_guard_ok,
    writes_planned: batchApply.writes_planned,
    writes_performed: batchApply.writes_performed,
    rollback_plan_verified: batchApply.rollback_plan_verified,
    execution_authorized: false,
    production_mutation_performed: false,
    operator_packet: operatorPacket,
    operator_packet_markdown: operatorPacketMarkdown,
    checks,
    errors,
  };
}

export { P3_PREPARATION_DRY_RUN_MODE };
