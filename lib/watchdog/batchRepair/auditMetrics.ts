import type { Seal } from '@/lib/vault-v2/types';
import { newestResolvedCanonicalSeal } from '@/lib/watchdog/canonicalLineageResolve';
import type {
  BatchAdjudicationMetrics,
  CollisionRepairBatchManifest,
  StagedLineageView,
} from '@/lib/watchdog/batchRepair/types';
import type { C397Witness, CollisionResolutionTable } from '@/lib/watchdog/batchRepair/witnessResolution';
import { extractCanonicalAssignments } from '@/lib/watchdog/batchRepair/witnessResolution';

export function resolveCanonicalSealIdForBlock(args: {
  block_number: number;
  canonical_assignments: Record<string, string>;
  clean_block_numbers: number[];
}): string | null {
  const assigned = args.canonical_assignments[String(args.block_number)];
  if (assigned) return assigned;
  if (args.clean_block_numbers.includes(args.block_number)) {
    return `seal-clean-b${args.block_number}`;
  }
  return null;
}

/** Segment-local prev-link check — fail closed when evidence is missing or mismatched. */
export function verifyBoundaryContinuity(args: {
  seals: Seal[];
  canonical_assignments: Record<string, string>;
  clean_block_numbers: number[];
  from_block: number;
  to_block: number;
}): 'pass' | 'fail' {
  const fromId = resolveCanonicalSealIdForBlock({
    block_number: args.from_block,
    canonical_assignments: args.canonical_assignments,
    clean_block_numbers: args.clean_block_numbers,
  });
  const toId = resolveCanonicalSealIdForBlock({
    block_number: args.to_block,
    canonical_assignments: args.canonical_assignments,
    clean_block_numbers: args.clean_block_numbers,
  });

  if (!fromId || !toId) return 'fail';

  const fromSeal = args.seals.find((s) => s.seal_id === fromId);
  const toSeal = args.seals.find((s) => s.seal_id === toId);
  if (!fromSeal || !toSeal) return 'fail';
  if (toSeal.prev_seal_hash === null) return 'fail';
  if (toSeal.prev_seal_hash !== fromSeal.seal_hash) return 'fail';
  return 'pass';
}

export function computeBatchAdjudicationMetrics(args: {
  witness: C397Witness;
  manifest: CollisionRepairBatchManifest;
  staged: StagedLineageView;
  seals: Seal[];
  clean_positions_modified: number;
}): BatchAdjudicationMetrics {
  const unresolved = Object.keys(args.manifest.canonical_assignments).filter(
    (block) => !args.staged.contested_assignments[block],
  ).length;

  const boundary_41_42 =
    args.manifest.boundary_expectations['41->42'] === 'must_pass'
      ? verifyBoundaryContinuity({
          seals: args.seals,
          canonical_assignments: args.manifest.canonical_assignments,
          clean_block_numbers: args.witness.clean_block_numbers,
          from_block: 41,
          to_block: 42,
        })
      : 'fail';

  return {
    historical_hash_divergent_pair_count: args.witness.counts.hash_divergent_pair_count,
    adjudicated_collision_positions: args.manifest.contested_positions,
    unresolved_collision_positions: unresolved,
    canonical_assignment_count: args.manifest.canonical_assignment_count,
    quarantined_witness_count: args.manifest.quarantined_conflicting_seal_count,
    original_seals_deleted: 0,
    clean_positions_modified: args.clean_positions_modified,
    boundary_41_42,
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

export function wireFixturePrevLinks(args: {
  seals: Seal[];
  witness: C397Witness;
  resolutionTable: CollisionResolutionTable;
}): void {
  const byId = new Map(args.seals.map((s) => [s.seal_id, s]));

  for (const seal of args.seals) {
    if (seal.sequence <= 1) continue;
    const prevBlock = seal.sequence - 1;
    const prevId = resolveCanonicalSealIdForBlock({
      block_number: prevBlock,
      canonical_assignments: extractCanonicalAssignments(args.resolutionTable),
      clean_block_numbers: args.witness.clean_block_numbers,
    });
    if (!prevId) continue;
    const prevSeal = byId.get(prevId);
    if (prevSeal) {
      seal.prev_seal_hash = prevSeal.seal_hash;
    }
  }
}
