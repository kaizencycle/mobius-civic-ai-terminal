import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAPTURE_2014Z_EXPECTED_HASHES,
  CAPTURE_2014Z_ID,
  isTrackRV2GovernanceCaptureId,
} from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import {
  TRACK_R_V2_EXECUTION_HANDOFF_PATH,
  TRACK_R_ALLOW_PRODUCTION_WRITES_ENV,
} from '@/lib/watchdog/batchRepair/oneShotExecutionGuard';
import { BATCH_EXECUTION_FEATURE_FLAG } from '@/lib/watchdog/batchRepair/commitGuard';
import type { BatchApplyMutationJournal } from '@/lib/watchdog/batchRepair/batchApplyMutationJournal';

export const P3_PREPARATION_DRY_RUN_MODE = 'dry_run_only' as const;

const V2_HASH_LABELS = [
  'semantic_manifest_hash',
  'lineage_snapshot_hash',
  'execution_witness_hash',
  'rollback_manifest_hash',
] as const;

export function assertP3DryRunModeExplicit(mode: string | undefined): { ok: boolean; errors: string[] } {
  if (mode !== P3_PREPARATION_DRY_RUN_MODE) {
    return {
      ok: false,
      errors: [`P3 preparation requires explicit dry_run_only mode; got ${mode ?? 'missing'}`],
    };
  }
  return { ok: true, errors: [] };
}

export function assertApplyModeRejected(apply?: boolean): { ok: boolean; errors: string[] } {
  if (apply === true) {
    return { ok: false, errors: ['P3 preparation rejects --apply; dry-run only'] };
  }
  return { ok: true, errors: [] };
}

export function assertSkipCasProbeRejectedForProduction(skipCasProbe?: boolean): {
  ok: boolean;
  errors: string[];
} {
  if (skipCasProbe === true) {
    return {
      ok: false,
      errors: ['P3 preparation rejects --skip-cas-probe; live CAS probing required'],
    };
  }
  return { ok: true, errors: [] };
}

export function assertProductionWriteEnvAbsent(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (process.env[BATCH_EXECUTION_FEATURE_FLAG]?.trim().toLowerCase() === 'true') {
    errors.push(`${BATCH_EXECUTION_FEATURE_FLAG}=true is forbidden during P3 preparation`);
  }
  if (process.env[TRACK_R_ALLOW_PRODUCTION_WRITES_ENV]?.trim().toLowerCase() === 'true') {
    errors.push(`${TRACK_R_ALLOW_PRODUCTION_WRITES_ENV}=true is forbidden during P3 preparation`);
  }
  return { ok: errors.length === 0, errors };
}

export function assertSignedHandoffNotConsumed(args?: { repoRoot?: string }): {
  ok: boolean;
  errors: string[];
} {
  const repoRoot = args?.repoRoot ?? process.cwd();
  const signedPath = join(repoRoot, TRACK_R_V2_EXECUTION_HANDOFF_PATH);
  if (!existsSync(signedPath)) {
    return { ok: true, errors: [] };
  }
  const content = readFileSync(signedPath, 'utf8');
  if (
    content.includes('ONE_SHOT_EXECUTION_AUTHORIZED') ||
    content.includes('one_shot_execution_authorized: true')
  ) {
    return {
      ok: false,
      errors: [
        'signed P3 execution handoff must not exist during preparation — issue handoff only after preparation review',
      ],
    };
  }
  return { ok: true, errors: [] };
}

export function assertUnsignedTemplateDoesNotAuthorize(content: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (/(?:^|\s)execution_authorized:\s*true/i.test(content)) {
    errors.push('unsigned template must not contain execution_authorized: true');
  }
  return { ok: errors.length === 0, errors };
}

export function assertReadinessDoesNotAuthorizeExecution(args: {
  readinessStatus: string;
  executionAuthorized: boolean;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (args.executionAuthorized !== false) {
    errors.push('execution_authorized must remain false during P3 preparation');
  }
  if (args.readinessStatus === 'execution_authorized') {
    errors.push('awaiting_execution_handoff is readiness, not authorization');
  }
  return { ok: errors.length === 0, errors };
}

export function assertCaptureNineBinding(captureId: string): { ok: boolean; errors: string[] } {
  if (!isTrackRV2GovernanceCaptureId(captureId)) {
    return {
      ok: false,
      errors: [`P3 preparation binds exclusively to Capture #9; got ${captureId}`],
    };
  }
  return { ok: true, errors: [] };
}

export function assertLockedHashBinding(args: {
  semantic_manifest_hash: string;
  lineage_snapshot_hash: string;
  execution_witness_hash: string;
  rollback_manifest_hash: string;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const label of V2_HASH_LABELS) {
    const expected = CAPTURE_2014Z_EXPECTED_HASHES[label];
    const observed = args[label];
    if (observed !== expected) {
      errors.push(`locked hash mismatch for ${label}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertBoundary131Unresolved(manifest: {
  governance_disposition: { promoted_canonical_through_position: number };
  boundary_expectations: Record<string, string>;
  canonical_assignments: Record<string, string>;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (manifest.governance_disposition.promoted_canonical_through_position !== 131) {
    errors.push('boundary 131→132 must remain unresolved (promoted_canonical_through_position=131)');
  }
  if (manifest.boundary_expectations['131->132'] !== 'pending_track_r_step_8') {
    errors.push('boundary 131→132 must remain pending_track_r_step_8');
  }
  if (manifest.canonical_assignments['361']) {
    errors.push('sequence 361 promotion is prohibited');
  }
  return { ok: errors.length === 0, errors };
}

export function assertMutationJournalComplete(journal: BatchApplyMutationJournal | null): {
  ok: boolean;
  errors: string[];
} {
  if (!journal) {
    return { ok: false, errors: ['mutation journal missing — partial journal generation fails closed'] };
  }
  if (!journal.journal_id || !journal.journal_hash || journal.entries.length === 0) {
    return { ok: false, errors: ['mutation journal incomplete — partial journal generation fails closed'] };
  }
  return { ok: true, errors: [] };
}

export function assertDuplicateJournalIdRejected(args: {
  journalId: string;
  issuedJournalIds: ReadonlySet<string>;
}): { ok: boolean; errors: string[] } {
  if (args.issuedJournalIds.has(args.journalId)) {
    return {
      ok: false,
      errors: [`journal_id ${args.journalId} already issued — cannot produce a second execution packet`],
    };
  }
  return { ok: true, errors: [] };
}

export function assertAffectedBlockSetAligned(checks: readonly { check: string; result: string }[]): {
  ok: boolean;
  errors: string[];
} {
  const affectedCheck = checks.find((row) => row.check.endsWith('_affected_block_set_match'));
  if (!affectedCheck) {
    return {
      ok: false,
      errors: ['affected-block-set assertion missing — fail closed'],
    };
  }
  if (affectedCheck.result !== 'pass') {
    return {
      ok: false,
      errors: ['affected-block-set drift detected at CAS boundary'],
    };
  }
  return { ok: true, errors: [] };
}

export function assertFreshCasMatch(freshCasMatch: boolean | null): { ok: boolean; errors: string[] } {
  if (freshCasMatch !== true) {
    return { ok: false, errors: ['fresh CAS match required for P3 preparation'] };
  }
  return { ok: true, errors: [] };
}

export function assertAwaitingExecutionHandoff(readinessStatus: string): { ok: boolean; errors: string[] } {
  if (readinessStatus !== 'awaiting_execution_handoff') {
    return {
      ok: false,
      errors: [`readiness must be awaiting_execution_handoff; got ${readinessStatus}`],
    };
  }
  return { ok: true, errors: [] };
}

export function assertApplyPreflightPass(preflightStatus: string): { ok: boolean; errors: string[] } {
  if (preflightStatus !== 'apply_preflight_pass') {
    return {
      ok: false,
      errors: [`batch apply preflight must be apply_preflight_pass; got ${preflightStatus}`],
    };
  }
  return { ok: true, errors: [] };
}

export function assertZeroProductionWrites(writesPerformed: number): { ok: boolean; errors: string[] } {
  if (writesPerformed !== 0) {
    return {
      ok: false,
      errors: [`P3 preparation requires zero production writes; observed ${writesPerformed}`],
    };
  }
  return { ok: true, errors: [] };
}

export const CAPTURE_NINE_ID = CAPTURE_2014Z_ID;
