import { join } from 'node:path';
import { loadApprovedCaptureManifest } from '@/lib/watchdog/batchRepair/runBatchApplyPreflight';
import { runBatchApply } from '@/lib/watchdog/batchRepair/runBatchApply';
import { runBatchApplyPreflight } from '@/lib/watchdog/batchRepair/runBatchApplyPreflight';
import { verifyTrackRExecutionReadiness } from '@/lib/watchdog/batchRepair/verifyTrackRExecutionReadiness';
import {
  observeProductionDeploymentCommit,
  assertProductionCommitBinding,
  assertProductionBaseUrlAllowed,
  TRACK_R_P3_ALLOWED_PRODUCTION_BASE_URLS,
} from '@/lib/watchdog/batchRepair/productionDeploymentBinding';
import {
  assertAffectedBlockSetAligned,
  assertApplyModeRejected,
  assertApplyPreflightPass,
  assertAwaitingExecutionHandoff,
  assertBoundary131Unresolved,
  assertCaptureNineBinding,
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
import {
  assertPacketNotPreviouslyIssued,
  ISSUED_PACKET_REGISTRY_PATH,
  loadIssuedPacketRegistry,
} from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import { renderProbeLog } from '@/lib/watchdog/batchRepair/materializeP3PreparationEvidence';
import { loadWitnessFromFile } from '@/lib/watchdog/batchRepair';
import { resolveTrackRCaptureBinding } from '@/lib/watchdog/batchRepair/trackRCaptureBinding';
import type { BatchApplyMutationJournal, BatchApplyWriteRecord } from '@/lib/watchdog/batchRepair/batchApplyMutationJournal';
import type { TrackRCaptureAttestationCheck } from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export type P3PreparationStatus = 'p3_preparation_pass' | 'p3_preparation_blocked';

export type P3PreparationResult = {
  status: P3PreparationStatus;
  verified_at: string;
  capture_id: string;
  checked_out_commit: string;
  observed_production_commit: string | null;
  observed_production_environment: string | null;
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
  mutation_journal: BatchApplyMutationJournal | null;
  write_records: BatchApplyWriteRecord[];
  intended_block_numbers: number[];
  readiness_log: string;
  preflight_log: string;
  batch_apply_log: string;
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
    assertProductionBaseUrlAllowed(args.baseUrl),
  ];

  const safetyLabels = [
    'p3_dry_run_mode',
    'p3_apply_rejected',
    'p3_skip_cas_probe_rejected',
    'p3_production_write_env_absent',
    'p3_signed_handoff_not_consumed',
    'p3_capture_nine_binding',
    'p3_production_base_url_allowlisted',
  ] as const;

  safetyChecks.forEach((row, index) => {
    addCheck(checks, safetyLabels[index], row.ok ? 'pass' : 'fail', row.errors.join('; ') || 'ok');
    errors.push(...row.errors);
  });

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
    observedEnvironment: deployment.environment,
  });
  addCheck(
    checks,
    'production_commit_match',
    commitBinding.ok ? 'pass' : 'fail',
    commitBinding.errors.join('; ') ||
      `${args.checkedOutCommit} == ${deployment.commit_sha} (production)`,
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
  const readinessGate = assertAwaitingExecutionHandoff(readiness.readiness_status);
  addCheck(
    checks,
    'readiness_status',
    readinessGate.ok ? 'pass' : 'fail',
    readiness.readiness_status,
  );
  errors.push(
    ...readinessGate.errors,
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
  const preflightGate = assertApplyPreflightPass(preflight.preflight_status);
  addCheck(
    checks,
    'apply_preflight_status',
    preflightGate.ok ? 'pass' : 'fail',
    preflight.preflight_status,
  );
  errors.push(...preflightGate.errors);

  const affectedBlock = assertAffectedBlockSetAligned(preflight.apply_cas.checks);
  addCheck(
    checks,
    'affected_block_set_alignment',
    affectedBlock.ok ? 'pass' : 'fail',
    affectedBlock.errors.join('; ') || 'apply-path affected block set aligned',
  );
  errors.push(...affectedBlock.errors);

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
  const dryRunGateOk = batchApply.apply_status === 'dry_run_pass';
  addCheck(
    checks,
    'batch_apply_dry_run',
    dryRunGateOk ? 'pass' : 'fail',
    batchApply.apply_status,
  );
  errors.push(...assertZeroProductionWrites(batchApply.writes_performed).errors);
  if (!dryRunGateOk) {
    errors.push(`batch apply dry-run must pass; got ${batchApply.apply_status}`);
  }

  const readinessLog = renderProbeLog({
    title: 'Track R execution readiness (P3 preparation)',
    status: readiness.readiness_status,
    checks: readiness.checks,
    extras: {
      fresh_cas_match: readiness.fresh_cas_match,
      execution_authorized: readiness.execution_authorized,
    },
  });
  const preflightLog = renderProbeLog({
    title: 'Track R batch apply preflight (P3 preparation)',
    status: preflight.preflight_status,
    checks: preflight.checks,
    extras: {
      commit_guard_ok: preflight.commit_guard_ok,
      execution_authorized: preflight.execution_authorized,
    },
  });
  const batchApplyLog = renderProbeLog({
    title: 'Track R batch apply dry-run (P3 preparation)',
    status: batchApply.apply_status,
    checks: batchApply.checks,
    extras: {
      writes_planned: batchApply.writes_planned,
      writes_performed: batchApply.writes_performed,
      execution_authorized: batchApply.execution_authorized,
    },
  });

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

  if (!batchApply.rollback_plan_verified) {
    errors.push('rollback plan verification failed');
    addCheck(checks, 'rollback_plan_verified', 'fail', 'rollback plan not verified');
  } else {
    addCheck(checks, 'rollback_plan_verified', 'pass', 'rollback plan verified');
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

  const witnessPath = join(
    repoRoot,
    'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json',
  );
  const witness = loadWitnessFromFile(witnessPath);
  const intendedBlocks = [...witness.contested_block_numbers].sort((a, b) => a - b);

  const registryLoad = loadIssuedPacketRegistry(repoRoot);
  addCheck(
    checks,
    'issued_packet_registry_available',
    registryLoad.ok ? 'pass' : 'fail',
    registryLoad.ok ? ISSUED_PACKET_REGISTRY_PATH : registryLoad.errors.join('; '),
  );
  if (!registryLoad.ok) {
    errors.push(...registryLoad.errors);
  }

  let operatorPacket: P3OperatorPacket | null = null;
  let operatorPacketMarkdown: string | null = null;

  if (
    errors.length === 0 &&
    registryLoad.ok &&
    batchApply.mutation_journal &&
    dryRunGateOk
  ) {
    const journalDuplicate = assertPacketNotPreviouslyIssued({
      journalId: batchApply.mutation_journal.journal_id,
      journalHash: batchApply.mutation_journal.journal_hash,
      packetHash: '',
      registry: registryLoad.registry,
    });
    addCheck(
      checks,
      'issued_packet_registry_journal_unique',
      journalDuplicate.ok ? 'pass' : 'fail',
      journalDuplicate.errors.join('; ') || 'journal id and hash not previously issued',
    );
    errors.push(...journalDuplicate.errors);
  }

  if (
    errors.length === 0 &&
    registryLoad.ok &&
    batchApply.mutation_journal &&
    dryRunGateOk
  ) {
    const packetChecks = checks.map((row) => ({ ...row }));
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
      checks: packetChecks,
    });

    const packetDuplicate = assertPacketNotPreviouslyIssued({
      journalId: batchApply.mutation_journal.journal_id,
      journalHash: batchApply.mutation_journal.journal_hash,
      packetHash: operatorPacket.packet_hash,
      registry: registryLoad.registry,
    });
    addCheck(
      checks,
      'issued_packet_registry_packet_unique',
      packetDuplicate.ok ? 'pass' : 'fail',
      packetDuplicate.errors.join('; ') || 'packet hash not previously issued',
    );
    if (!packetDuplicate.ok) {
      errors.push(...packetDuplicate.errors);
      operatorPacket = null;
    } else {
      operatorPacketMarkdown = renderP3OperatorPacketMarkdown(operatorPacket);
    }
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
    observed_production_environment: deployment.environment,
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
    mutation_journal: batchApply.mutation_journal,
    write_records: batchApply.write_records,
    intended_block_numbers: intendedBlocks,
    readiness_log: readinessLog,
    preflight_log: preflightLog,
    batch_apply_log: batchApplyLog,
    checks,
    errors,
  };
}

export { P3_PREPARATION_DRY_RUN_MODE, TRACK_R_P3_ALLOWED_PRODUCTION_BASE_URLS };
