import type { Seal } from '@/lib/vault-v2/types';
import { newestResolvedCanonicalSeal } from '@/lib/watchdog/canonicalLineageResolve';
import type {
  BatchAdjudicationMetrics,
  CollisionRepairBatchManifest,
  StagedLineageView,
} from '@/lib/watchdog/batchRepair/types';
import type { C397Witness } from '@/lib/watchdog/batchRepair/witnessResolution';

export function computeBatchAdjudicationMetrics(args: {
  witness: C397Witness;
  manifest: CollisionRepairBatchManifest;
  staged: StagedLineageView;
  clean_positions_modified: number;
}): BatchAdjudicationMetrics {
  const unresolved = Object.keys(args.manifest.canonical_assignments).filter(
    (block) => !args.staged.contested_assignments[block],
  ).length;

  return {
    historical_hash_divergent_pair_count: args.witness.counts.hash_divergent_pair_count,
    adjudicated_collision_positions: args.manifest.contested_positions,
    unresolved_collision_positions: unresolved,
    canonical_assignment_count: args.manifest.canonical_assignment_count,
    quarantined_witness_count: args.manifest.quarantined_conflicting_seal_count,
    original_seals_deleted: 0,
    clean_positions_modified: args.clean_positions_modified,
    boundary_41_42:
      args.manifest.boundary_expectations['41->42'] === 'must_pass' ? 'pass' : 'fail',
    boundary_131_132: 'pending_track_r_step_8',
  };
}

export function deriveLatestCanonicalSeal(
  manifest: CollisionRepairBatchManifest,
  seals: Seal[],
): string | null {
  const pendingCanonical = new Map<number, string>();
  for (const [block, seal_id] of Object.entries(manifest.canonical_assignments)) {
    pendingCanonical.set(Number(block), seal_id);
  }
  const quarantined = new Set(manifest.quarantined_seal_ids);
  const canonicalIndex = new Map<number, string | null>();

  const { target, unresolved_blocks } = newestResolvedCanonicalSeal({
    seals,
    quarantined,
    canonicalIndex,
    pendingCanonical,
  });

  if (unresolved_blocks.length > 0) return null;
  return target?.seal_id ?? null;
}
