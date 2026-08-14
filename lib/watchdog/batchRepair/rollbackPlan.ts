import type { CollisionRepairBatchManifest, RollbackPlan } from '@/lib/watchdog/batchRepair/types';
import { LINEAGE_ACTIVE_VERSION_KEY } from '@/lib/watchdog/batchRepair/versionedStaging';

export function buildRollbackPlan(args: {
  manifest: CollisionRepairBatchManifest;
  previous_active_version: string | null;
  previous_latest_pointer: string | null;
}): RollbackPlan {
  return {
    repair_id: args.manifest.repair_id,
    previous_active_version: args.previous_active_version,
    restore: {
      active_lineage_version: args.previous_active_version,
      latest_pointer: args.previous_latest_pointer,
      canonical_map_selection: 'prior_active_version',
      quarantine_view: 'prior_active_version',
    },
    preserves: [
      'original seal records',
      'receipts',
      'batch manifests',
      'mutation-journal evidence',
      'prior lineage versions',
    ],
    journals_required: true,
  };
}

export function rollbackJournalEntry(plan: RollbackPlan): Record<string, unknown> {
  return {
    operation: 'track_r_batch_rollback',
    repair_id: plan.repair_id,
    restored_active_version: plan.restore.active_lineage_version,
    active_version_key: LINEAGE_ACTIVE_VERSION_KEY,
    timestamp: new Date().toISOString(),
  };
}
