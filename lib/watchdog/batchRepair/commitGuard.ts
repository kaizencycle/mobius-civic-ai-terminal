import type { BatchCommitGuardInput } from '@/lib/watchdog/batchRepair/types';

export const BATCH_EXECUTION_FEATURE_FLAG = 'TRACK_R_BATCH_EXECUTION_ENABLED';

/** Default false — no env var may enable execution implicitly. */
export function isBatchExecutionFeatureFlagEnabled(): boolean {
  return process.env[BATCH_EXECUTION_FEATURE_FLAG] === 'true';
}

export function assertBatchCommitAllowed(input: BatchCommitGuardInput): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (input.dry_run !== false) {
    errors.push('dry_run must be false for commit');
  }
  if (!input.explicit_operator_command) {
    errors.push('explicit operator command required');
  }
  if (!input.execution_feature_flag_enabled) {
    errors.push(`${BATCH_EXECUTION_FEATURE_FLAG} must be true`);
  }
  if (!input.approved_manifest_hash) {
    errors.push('approved_manifest_hash required');
  } else if (input.approved_manifest_hash !== input.manifest.manifest_hash) {
    errors.push('approved_manifest_hash mismatch');
  }
  if (input.manifest.zeus_verdict !== 'approved') {
    errors.push('ZEUS verdict must be approved');
  }
  if (input.manifest.eve_verdict !== 'approved') {
    errors.push('EVE verdict must be approved');
  }
  if (input.manifest.human_approval !== 'approved') {
    errors.push('human approval must be approved');
  }
  if (!input.fresh_kv_snapshot_matches) {
    errors.push('fresh KV snapshot does not match manifest');
  }
  if (!input.integrity_gate_active) {
    errors.push('integrity gate must be active before batch commit');
  }
  if (!input.mutation_journal_available) {
    errors.push('mutation journal must be available');
  }
  if (!input.rollback_plan_verified) {
    errors.push('rollback plan must be verified');
  }
  if (input.manifest.production_execution_enabled !== false) {
    errors.push('manifest production_execution_enabled must remain false until governance approves');
  }

  return { ok: errors.length === 0, errors };
}
