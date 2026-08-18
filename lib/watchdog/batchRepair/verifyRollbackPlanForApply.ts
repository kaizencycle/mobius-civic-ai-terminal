import type { RollbackPlan } from '@/lib/watchdog/batchRepair/types';
import { LINEAGE_ACTIVE_VERSION_KEY } from '@/lib/watchdog/batchRepair/versionedStaging';

export function verifyRollbackPlanForApply(plan: RollbackPlan): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan.repair_id) {
    errors.push('rollback plan missing repair_id');
  }
  if (!plan.journals_required) {
    errors.push('rollback plan must require mutation journals');
  }
  if (plan.restore.canonical_map_selection !== 'prior_active_version') {
    errors.push('rollback plan must restore canonical map from prior active version');
  }
  if (plan.restore.quarantine_view !== 'prior_active_version') {
    errors.push('rollback plan must restore quarantine view from prior active version');
  }
  if (!plan.preserves.includes('mutation-journal evidence')) {
    errors.push('rollback plan must preserve mutation-journal evidence');
  }
  if (!plan.preserves.includes('prior lineage versions')) {
    errors.push('rollback plan must preserve prior lineage versions');
  }

  const entry = {
    operation: 'track_r_batch_rollback',
    repair_id: plan.repair_id,
    restored_active_version: plan.restore.active_lineage_version,
    active_version_key: LINEAGE_ACTIVE_VERSION_KEY,
  };

  if (!entry.operation || !entry.repair_id) {
    errors.push('rollback journal entry template invalid');
  }

  return { ok: errors.length === 0, errors };
}
