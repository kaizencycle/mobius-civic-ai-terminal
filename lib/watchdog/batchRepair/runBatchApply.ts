import { join } from 'node:path';
import { deriveLatestCanonicalSeal } from '@/lib/watchdog/batchRepair/auditMetrics';
import {
  assertBatchCommitAllowedAtApply,
  executeBatchDryRun,
  loadApprovedCaptureManifest,
  loadResolutionTableFromFile,
  loadWitnessFromFile,
  runBatchApplyPreflight,
  simulateBatchPrepare,
  stageVersionedLineage,
  activateVersionPointer,
  verifyStagedVersionComplete,
  validateBatchManifest,
  buildFixtureSealsFromWitness,
} from '@/lib/watchdog/batchRepair';
import { assessGovernance131Cutoff } from '@/lib/watchdog/batchRepair/governance131Cutoff';
import {
  CAPTURE_2014Z_EXPECTED_HASHES,
  CAPTURE_2014Z_ID,
  isTrackRV2GovernanceCaptureId,
  TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION,
} from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import {
  resolveTrackRCaptureBinding,
  type TrackRCaptureBinding,
} from '@/lib/watchdog/batchRepair/trackRCaptureBinding';
import { validateV2SignedGovernanceAttestations } from '@/lib/watchdog/batchRepair/verifyTrackRExecutionReadiness';
import type { TrackRCaptureAttestationCheck } from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';
import type { FreshLineageSnapshotFromProduction } from '@/lib/watchdog/batchRepair/computeFreshLineageSnapshotFromProduction';
import {
  buildJournalId,
  InMemoryBatchApplyMutationJournal,
  type BatchApplyMutationJournal,
  type BatchApplyWriteRecord,
} from '@/lib/watchdog/batchRepair/batchApplyMutationJournal';
import { verifyRollbackPlanForApply } from '@/lib/watchdog/batchRepair/verifyRollbackPlanForApply';
import {
  assertOneShotApplyNotConsumed,
  isProductionWriteArmEnabled,
  TRACK_R_ALLOW_PRODUCTION_WRITES_ENV,
  validateV2ExecutionHandoff,
} from '@/lib/watchdog/batchRepair/oneShotExecutionGuard';
import {
  BATCH_EXECUTION_FEATURE_FLAG,
  isBatchExecutionFeatureFlagEnabled,
} from '@/lib/watchdog/batchRepair/commitGuard';
import { exportAuthenticatedLiveSealWitness } from '@/lib/watchdog/batchRepair/liveSealWitnessExport';
import {
  InMemoryLineageStore,
  LINEAGE_ACTIVE_VERSION_KEY,
  type LineageStore,
} from '@/lib/watchdog/batchRepair/versionedStaging';
import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';
import type { BatchDryRunReport, CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';

export type BatchApplyMode = 'dry_run' | 'live_apply';

export type BatchApplyStatus =
  | 'dry_run_pass'
  | 'dry_run_blocked'
  | 'live_apply_blocked'
  | 'live_apply_pass'
  | 'apply_cas_drift'
  | 'apply_credentials_required'
  | 'apply_blocked';

export type BatchApplyResult = {
  capture_id: string;
  verified_at: string;
  mode: BatchApplyMode;
  apply_status: BatchApplyStatus;
  execution_authorized: false;
  production_mutation_performed: boolean;
  attested_lineage_snapshot_hash: string;
  fresh_lineage_snapshot_hash: string | null;
  fresh_cas_match: boolean | null;
  preflight_alignment_ok: boolean;
  commit_guard_ok: boolean;
  writes_planned: number;
  writes_performed: number;
  write_records: BatchApplyWriteRecord[];
  mutation_journal: BatchApplyMutationJournal | null;
  rollback_plan_verified: boolean;
  one_shot_guard_ok: boolean;
  post_write_verification_ok: boolean | null;
  dry_run_report: BatchDryRunReport | null;
  checks: TrackRCaptureAttestationCheck[];
  errors: string[];
};

const V2_BINDING_HASH_LABELS = [
  'semantic_manifest_hash',
  'lineage_snapshot_hash',
  'execution_witness_hash',
  'rollback_manifest_hash',
] as const;

function fixturePaths(repoRoot: string): { witnessPath: string; tablePath: string } {
  return {
    witnessPath: join(
      repoRoot,
      'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json',
    ),
    tablePath: join(
      repoRoot,
      'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json',
    ),
  };
}

function addCheck(
  checks: TrackRCaptureAttestationCheck[],
  check: string,
  result: TrackRCaptureAttestationCheck['result'],
  detail: string,
): void {
  checks.push({ check, result, detail });
}

function assertCaptureNineV2Binding(binding: TrackRCaptureBinding): string[] {
  const errors: string[] = [];
  if (!isTrackRV2GovernanceCaptureId(binding.capture_id)) {
    errors.push(`batch apply binds exclusively to Capture #9; got ${binding.capture_id}`);
  }
  if (binding.lineage_snapshot_version !== TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION) {
    errors.push('batch apply requires v2 lineage snapshot binding');
  }
  for (const label of V2_BINDING_HASH_LABELS) {
    const expected = CAPTURE_2014Z_EXPECTED_HASHES[label];
    const observed = binding.attestation_hashes[label];
    if (observed !== expected) {
      errors.push(`locked hash mismatch for ${label}`);
    }
  }
  return errors;
}

function buildSimulatedApplyCas(args: {
  binding: TrackRCaptureBinding;
  verifiedAt: string;
}): FreshLineageSnapshotFromProduction {
  const hash = args.binding.attestation_hashes.lineage_snapshot_hash;
  return {
    capture_id: args.binding.capture_id,
    verified_at: args.verifiedAt,
    lineage_snapshot_version: args.binding.lineage_snapshot_version,
    attested_lineage_snapshot_hash: hash,
    fresh_lineage_snapshot_hash: hash,
    fresh_cas_match: true,
    fresh_lineage_snapshot_hash_matches: true,
    observed_integrity_gate_active: true,
    fresh_lineage_snapshot_hash_v2: hash,
    checks: [
      {
        check: 'apply_cas_simulated',
        result: 'warn',
        detail:
          'dry-run simulated CAS from Capture #9 locked binding — not a production re-read',
      },
    ],
  };
}

function assertApprovedManifestAligned(args: {
  binding: TrackRCaptureBinding;
  manifest: CollisionRepairBatchManifest;
}): string[] {
  const errors: string[] = [];
  if (args.manifest.manifest_hash !== CAPTURE_2014Z_EXPECTED_HASHES.semantic_manifest_hash) {
    errors.push('approved manifest hash does not match Capture #9 semantic_manifest_hash');
  }
  if (args.manifest.manifest_hash !== args.binding.attestation_hashes.semantic_manifest_hash) {
    errors.push('approved manifest hash does not match capture binding semantic_manifest_hash');
  }
  if (args.manifest.governance_disposition.promoted_canonical_through_position !== 131) {
    errors.push('manifest must not promote beyond position 131');
  }
  if (args.manifest.boundary_expectations['131->132'] !== 'pending_track_r_step_8') {
    errors.push('boundary 131->132 must remain pending_track_r_step_8');
  }
  const maxContestedBlock = Math.max(
    ...Object.keys(args.manifest.canonical_assignments).map((block) => Number(block)),
  );
  if (maxContestedBlock > 131) {
    errors.push('canonical assignments must not exceed position 131');
  }
  if (args.manifest.canonical_assignments['361']) {
    errors.push('sequence 361 promotion is prohibited');
  }
  return errors;
}

function planStagingWriteRecords(args: {
  store: LineageStore;
  manifest: CollisionRepairBatchManifest;
  clean_block_numbers: number[];
  derived_latest: string | null;
}): { write_records: BatchApplyWriteRecord[]; writes_planned: number } {
  const beforeActive = args.store.get(LINEAGE_ACTIVE_VERSION_KEY);
  const staged = stageVersionedLineage({
    manifest: args.manifest,
    clean_block_numbers: args.clean_block_numbers,
    derived_latest_canonical_seal_id: args.derived_latest,
    store: args.store,
    write: false,
  });

  return {
    writes_planned: 4,
    write_records: [
      {
        key: staged.view.version_keys.manifest,
        before: args.store.get(staged.view.version_keys.manifest),
        after: '[staged manifest payload]',
      },
      {
        key: staged.view.version_keys.canonical,
        before: args.store.get(staged.view.version_keys.canonical),
        after: '[staged canonical map payload]',
      },
      {
        key: staged.view.version_keys.quarantine,
        before: args.store.get(staged.view.version_keys.quarantine),
        after: '[staged quarantine payload]',
      },
      {
        key: LINEAGE_ACTIVE_VERSION_KEY,
        before: beforeActive,
        after: args.manifest.repair_id,
      },
    ],
  };
}

function verifyPostWriteState(args: {
  store: LineageStore;
  repair_id: string;
  expected_manifest_hash: string;
  expected_writes: number;
  actual_writes: number;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (args.actual_writes !== args.expected_writes) {
    errors.push(
      `partial application detected: expected ${args.expected_writes} writes, performed ${args.actual_writes}`,
    );
  }
  const staged = verifyStagedVersionComplete({
    store: args.store,
    repair_id: args.repair_id,
    expected_manifest_hash: args.expected_manifest_hash,
  });
  if (!staged.ok) {
    errors.push(...staged.errors.map((detail) => `post-write staging incomplete: ${detail}`));
  }
  if (args.store.get(LINEAGE_ACTIVE_VERSION_KEY) !== args.repair_id) {
    errors.push('post-write active version pointer mismatch');
  }
  return { ok: errors.length === 0, errors };
}

export async function runBatchApply(args?: {
  verifiedAt?: string;
  baseUrl?: string;
  repoRoot?: string;
  captureId?: string;
  apply?: boolean;
  skipCasProbe?: boolean;
  explicitOperatorCommand?: boolean;
  store?: LineageStore;
  handoffPath?: string;
}): Promise<BatchApplyResult> {
  const verifiedAt = args?.verifiedAt ?? new Date().toISOString();
  const repoRoot = args?.repoRoot ?? process.cwd();
  const checks: TrackRCaptureAttestationCheck[] = [];
  const errors: string[] = [];
  const mode: BatchApplyMode = args?.apply === true ? 'live_apply' : 'dry_run';
  const { witnessPath, tablePath } = fixturePaths(repoRoot);

  const binding = resolveTrackRCaptureBinding({
    captureId: args?.captureId,
    repoRoot,
  });

  const bindingErrors = assertCaptureNineV2Binding(binding);
  addCheck(
    checks,
    'capture_nine_v2_binding',
    bindingErrors.length === 0 ? 'pass' : 'fail',
    bindingErrors.join('; ') || CAPTURE_2014Z_ID,
  );
  errors.push(...bindingErrors);

  const signedAttestations = validateV2SignedGovernanceAttestations({ repoRoot });
  addCheck(
    checks,
    'governance_signed_attestations_present',
    signedAttestations.complete && signedAttestations.ok ? 'pass' : 'fail',
    signedAttestations.complete
      ? 'ZEUS/EVE/human signed artifacts present'
      : signedAttestations.errors.join('; '),
  );
  if (!signedAttestations.complete || !signedAttestations.ok) {
    errors.push(
      ...(signedAttestations.errors.length > 0
        ? signedAttestations.errors
        : ['awaiting complete v2 signed governance triad']),
    );
  }

  addCheck(
    checks,
    'execution_authority_not_derived_from_governance_files',
    'pass',
    'signed attestations and awaiting_execution_handoff do not authorize mutation',
  );

  const manifest = loadApprovedCaptureManifest(repoRoot);
  const manifestErrors = assertApprovedManifestAligned({ binding, manifest });
  addCheck(
    checks,
    'approved_manifest_capture_nine_alignment',
    manifestErrors.length === 0 ? 'pass' : 'fail',
    manifestErrors.join('; ') || CAPTURE_2014Z_EXPECTED_HASHES.semantic_manifest_hash,
  );
  errors.push(...manifestErrors);

  const witness = loadWitnessFromFile(witnessPath);
  const table = loadResolutionTableFromFile(tablePath);
  const seals = buildFixtureSealsFromWitness(witness, table);

  const dryRun = await executeBatchDryRun({
    witnessPath,
    resolutionTablePath: tablePath,
    seals,
  });
  addCheck(
    checks,
    'batch_engine_dry_run',
    dryRun.ok ? 'pass' : 'fail',
    dryRun.ok ? 'fixture batch engine pass' : dryRun.errors.join('; '),
  );
  errors.push(...dryRun.errors);

  const manifestValidation = validateBatchManifest({
    manifest,
    resolutionTable: table,
    mode: mode === 'live_apply' ? 'commit' : 'dry_run',
    approved_manifest_hash: manifest.manifest_hash,
  });
  addCheck(
    checks,
    'batch_manifest_validation',
    manifestValidation.ok ? 'pass' : 'fail',
    manifestValidation.ok ? 'manifest valid' : manifestValidation.errors.join('; '),
  );
  errors.push(...manifestValidation.errors);

  const simulation = simulateBatchPrepare({ manifest, seals });
  addCheck(
    checks,
    'approved_block_set_prepare',
    simulation.ok ? 'pass' : 'fail',
    simulation.ok
      ? '123 contested blocks prepare cleanly'
      : `failed blocks: ${simulation.failed_blocks.join(', ')}`,
  );
  if (!simulation.ok) {
    errors.push(`batch prepare failed for blocks: ${simulation.failed_blocks.join(', ')}`);
  }

  const governance131 = assessGovernance131Cutoff({
    manifest,
    live_witness_records: [],
    seals_for_boundary_check: seals,
    clean_block_numbers: witness.clean_block_numbers,
  });
  addCheck(
    checks,
    'governance_131_cutoff',
    governance131.ok ? 'pass' : 'fail',
    governance131.ok
      ? 'positions 1-131 only; 132-194 verified_unattached'
      : governance131.errors.join('; '),
  );
  errors.push(...governance131.errors);

  const rollbackPlan = dryRun.report?.rollback_plan;
  const rollbackVerified = rollbackPlan
    ? verifyRollbackPlanForApply(rollbackPlan)
    : { ok: false, errors: ['rollback plan missing from dry-run report'] };
  addCheck(
    checks,
    'rollback_plan_verified',
    rollbackVerified.ok ? 'pass' : 'fail',
    rollbackVerified.ok ? 'rollback plan verified' : rollbackVerified.errors.join('; '),
  );
  if (!rollbackVerified.ok) {
    errors.push(...rollbackVerified.errors);
  }

  const journal = new InMemoryBatchApplyMutationJournal(
    buildJournalId({
      capture_id: binding.capture_id,
      repair_id: manifest.repair_id,
      verified_at: verifiedAt,
    }),
    binding.capture_id,
    manifest.repair_id,
    verifiedAt,
  );

  const store = args?.store ?? new InMemoryLineageStore();

  const oneShot = assertOneShotApplyNotConsumed({
    journal,
    repair_id: manifest.repair_id,
    store,
  });
  addCheck(
    checks,
    'one_shot_idempotency_guard',
    oneShot.ok ? 'pass' : 'fail',
    oneShot.ok ? 'no prior committed activation' : oneShot.errors.join('; '),
  );
  if (!oneShot.ok) {
    errors.push(...oneShot.errors);
  }

  let applyCas: FreshLineageSnapshotFromProduction;
  let preflightAlignmentOk = false;
  let commitGuardOk = false;

  if (mode === 'dry_run') {
    if (args?.skipCasProbe === true || !hasUpstashKvCredentials()) {
      applyCas = buildSimulatedApplyCas({ binding, verifiedAt });
      preflightAlignmentOk =
        applyCas.fresh_cas_match === true && applyCas.fresh_lineage_snapshot_hash_matches;
      commitGuardOk = preflightAlignmentOk && errors.length === 0;
      addCheck(
        checks,
        'preflight_packet_alignment',
        preflightAlignmentOk ? 'pass' : 'fail',
        'simulated Capture #9 CAS alignment for dry-run',
      );
    } else {
      const preflight = await runBatchApplyPreflight({
        verifiedAt,
        baseUrl: args?.baseUrl,
        repoRoot,
        captureId: binding.capture_id,
        explicitOperatorCommand: args?.explicitOperatorCommand ?? true,
      });
      for (const row of preflight.checks) {
        checks.push(row);
      }
      applyCas = preflight.apply_cas;
      preflightAlignmentOk = preflight.preflight_status === 'apply_preflight_pass';
      commitGuardOk = preflight.commit_guard_ok;
      addCheck(
        checks,
        'preflight_packet_alignment',
        preflightAlignmentOk ? 'pass' : 'fail',
        preflight.preflight_status,
      );
      if (!preflightAlignmentOk) {
        errors.push(`preflight alignment failed: ${preflight.preflight_status}`);
      }
    }
  } else {
    if (!isBatchExecutionFeatureFlagEnabled()) {
      errors.push(`${BATCH_EXECUTION_FEATURE_FLAG} must be true for live apply`);
    }
    if (!(args?.explicitOperatorCommand ?? false)) {
      errors.push('explicit operator command required for live apply');
    }

    const handoff = validateV2ExecutionHandoff({ repoRoot, handoffPath: args?.handoffPath });
    addCheck(
      checks,
      'p3_execution_handoff',
      handoff.ok ? 'pass' : 'fail',
      handoff.ok ? handoff.path : handoff.errors.join('; '),
    );
    if (!handoff.ok) {
      errors.push(...handoff.errors);
    }

    if (!isProductionWriteArmEnabled()) {
      errors.push(
        `${TRACK_R_ALLOW_PRODUCTION_WRITES_ENV}=true required to arm production writes (fail-closed default)`,
      );
    }

    if (args?.skipCasProbe === true) {
      applyCas = buildSimulatedApplyCas({ binding, verifiedAt });
      addCheck(
        checks,
        'apply_time_cas_recheck',
        'warn',
        'CAS probe skipped — in-memory / test apply path only',
      );
      preflightAlignmentOk = errors.length === 0;
      commitGuardOk = preflightAlignmentOk;
    } else {
      if (!hasUpstashKvCredentials()) {
        errors.push('production KV credentials required for live apply CAS recheck');
      }

      const witnessAttempt = await exportAuthenticatedLiveSealWitness({
        capture_id: binding.capture_id,
        exported_at: verifiedAt,
        environment_identifier: 'production-batch-apply-live-cas-recheck',
        witness,
        manifest,
      });

      const guardAttempt = await assertBatchCommitAllowedAtApply({
        guardInput: {
          manifest,
          approved_manifest_hash: manifest.manifest_hash,
          dry_run: false,
          execution_feature_flag_enabled: isBatchExecutionFeatureFlagEnabled(),
          explicit_operator_command: args?.explicitOperatorCommand ?? false,
          mutation_journal_available: true,
          rollback_plan_verified: rollbackVerified.ok,
          lineage_snapshot_version: binding.lineage_snapshot_version,
          attested_lineage_snapshot_hash: binding.attestation_hashes.lineage_snapshot_hash,
          attested_execution_witness_hash: binding.attestation_hashes.execution_witness_hash,
          pinned_witness: witness,
          live_seal_witness_export: witnessAttempt.export,
        },
        preflightReadOnly: false,
        verifiedAt,
        baseUrl: args?.baseUrl,
        repoRoot,
      });
      applyCas = guardAttempt.applyCas;
      for (const row of applyCas.checks) {
        checks.push(row);
      }
      commitGuardOk = guardAttempt.ok;
      preflightAlignmentOk = guardAttempt.ok;
      addCheck(
        checks,
        'apply_time_cas_recheck',
        guardAttempt.ok ? 'pass' : 'fail',
        guardAttempt.ok ? 'production CAS verified at apply boundary' : guardAttempt.errors.join('; '),
      );
      if (!guardAttempt.ok) {
        errors.push(...guardAttempt.errors);
      }
    }
  }

  const derivedLatest = deriveLatestCanonicalSeal(manifest, seals);
  const { write_records, writes_planned } = planStagingWriteRecords({
    store,
    manifest,
    clean_block_numbers: witness.clean_block_numbers,
    derived_latest: derivedLatest,
  });

  journal.append({
    at: verifiedAt,
    operation: 'track_r_batch_apply_dry_run',
    repair_id: manifest.repair_id,
    capture_id: binding.capture_id,
    mode,
    lineage_snapshot_hash: binding.attestation_hashes.lineage_snapshot_hash,
    execution_witness_hash: binding.attestation_hashes.execution_witness_hash,
    before: { active_version: store.get(LINEAGE_ACTIVE_VERSION_KEY) },
    after: { active_version: manifest.repair_id },
    write_records,
  });

  let writesPerformed = 0;
  let productionMutationPerformed = false;
  let postWriteVerificationOk: boolean | null = null;

  const liveWriteArmed =
    mode === 'live_apply' &&
    errors.length === 0 &&
    commitGuardOk &&
    isProductionWriteArmEnabled() &&
    (hasUpstashKvCredentials() || args?.skipCasProbe === true) &&
    args?.store !== undefined;

  if (liveWriteArmed) {
    const previousActive = store.get(LINEAGE_ACTIVE_VERSION_KEY);
    const staged = stageVersionedLineage({
      manifest,
      clean_block_numbers: witness.clean_block_numbers,
      derived_latest_canonical_seal_id: derivedLatest,
      store,
      write: true,
    });
    writesPerformed += staged.writes;

    journal.append({
      at: new Date().toISOString(),
      operation: 'track_r_batch_apply_staging',
      repair_id: manifest.repair_id,
      capture_id: binding.capture_id,
      mode,
      lineage_snapshot_hash: binding.attestation_hashes.lineage_snapshot_hash,
      execution_witness_hash: binding.attestation_hashes.execution_witness_hash,
      before: { staged_keys: 0 },
      after: { staged_keys: staged.writes },
      write_records,
    });

    const activation = activateVersionPointer({
      store,
      repair_id: manifest.repair_id,
      expected_active_version: previousActive,
      expected_manifest_hash: manifest.manifest_hash,
    });
    if (!activation.ok) {
      errors.push(activation.detail);
    } else {
      writesPerformed += 1;
      productionMutationPerformed = true;
      journal.append({
        at: new Date().toISOString(),
        operation: 'track_r_batch_apply_activation',
        repair_id: manifest.repair_id,
        capture_id: binding.capture_id,
        mode,
        lineage_snapshot_hash: binding.attestation_hashes.lineage_snapshot_hash,
        execution_witness_hash: binding.attestation_hashes.execution_witness_hash,
        before: { active_version: previousActive },
        after: { active_version: manifest.repair_id },
      });
    }

    const postWrite = verifyPostWriteState({
      store,
      repair_id: manifest.repair_id,
      expected_manifest_hash: manifest.manifest_hash,
      expected_writes: writes_planned,
      actual_writes: writesPerformed,
    });
    postWriteVerificationOk = postWrite.ok;
    addCheck(
      checks,
      'post_write_verification',
      postWrite.ok ? 'pass' : 'fail',
      postWrite.ok ? 'post-write state verified' : postWrite.errors.join('; '),
    );
    if (!postWrite.ok) {
      errors.push(...postWrite.errors);
    }
  } else if (mode === 'dry_run') {
    postWriteVerificationOk = null;
    addCheck(checks, 'post_write_verification', 'warn', 'skipped in dry-run mode');
  } else {
    postWriteVerificationOk = false;
    addCheck(
      checks,
      'post_write_verification',
      'fail',
      'live apply gates incomplete — no production writes performed',
    );
  }

  const mutationJournal = journal.finalize();

  let applyStatus: BatchApplyStatus = 'apply_blocked';
  if (mode === 'dry_run') {
    applyStatus =
      errors.length === 0 && preflightAlignmentOk && dryRun.ok ? 'dry_run_pass' : 'dry_run_blocked';
  } else if (
    productionMutationPerformed &&
    postWriteVerificationOk === true &&
    errors.length === 0
  ) {
    applyStatus = 'live_apply_pass';
  } else if (applyCas.fresh_cas_match === false) {
    applyStatus = 'apply_cas_drift';
  } else if (
    !hasUpstashKvCredentials() &&
    args?.skipCasProbe !== true &&
    args?.store === undefined
  ) {
    applyStatus = 'apply_credentials_required';
  } else if (mode === 'live_apply') {
    applyStatus = 'live_apply_blocked';
  }

  addCheck(
    checks,
    'apply_summary',
    applyStatus.endsWith('pass') ? 'pass' : 'fail',
    applyStatus,
  );

  return {
    capture_id: binding.capture_id,
    verified_at: verifiedAt,
    mode,
    apply_status: applyStatus,
    execution_authorized: false,
    production_mutation_performed: productionMutationPerformed,
    attested_lineage_snapshot_hash: binding.attestation_hashes.lineage_snapshot_hash,
    fresh_lineage_snapshot_hash: applyCas.fresh_lineage_snapshot_hash,
    fresh_cas_match: applyCas.fresh_cas_match,
    preflight_alignment_ok: preflightAlignmentOk,
    commit_guard_ok: commitGuardOk,
    writes_planned,
    writes_performed: writesPerformed,
    write_records,
    mutation_journal: mutationJournal,
    rollback_plan_verified: rollbackVerified.ok,
    one_shot_guard_ok: oneShot.ok,
    post_write_verification_ok: postWriteVerificationOk,
    dry_run_report: dryRun.report ?? null,
    checks,
    errors,
  };
}
