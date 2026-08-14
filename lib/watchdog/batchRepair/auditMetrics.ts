import type { Seal } from '@/lib/vault-v2/types';
import { newestResolvedCanonicalSeal } from '@/lib/watchdog/canonicalLineageResolve';
import type {
  BatchAdjudicationMetrics,
  CollisionRepairBatchManifest,
  StagedLineageView,
} from '@/lib/watchdog/batchRepair/types';
import type { C397Witness } from '@/lib/watchdog/batchRepair/witnessResolution';

/** Deferred segment boundaries — must not be auto-wired in fixtures or reported as pass. */
export const DEFERRED_BOUNDARY_EDGES: ReadonlyArray<readonly [number, number]> = [[131, 132]];

export function resolveCanonicalSealIdForBlock(args: {
  block_number: number;
  canonical_assignments: Record<string, string>;
  seals: Seal[];
  clean_block_numbers: number[];
}): string | null {
  const assigned = args.canonical_assignments[String(args.block_number)];
  if (assigned) return assigned;

  if (!args.clean_block_numbers.includes(args.block_number)) return null;

  const attestedAtBlock = args.seals.filter(
    (seal) => seal.sequence === args.block_number && seal.status === 'attested',
  );
  if (attestedAtBlock.length === 1) return attestedAtBlock[0].seal_id;
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
    seals: args.seals,
    clean_block_numbers: args.clean_block_numbers,
  });
  const toId = resolveCanonicalSealIdForBlock({
    block_number: args.to_block,
    canonical_assignments: args.canonical_assignments,
    seals: args.seals,
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

/**
 * Fixture-only: align block 42 canonical prev to block 41 seal hash for the must_pass boundary.
 * Does not rewire deferred boundaries (131->132) or global chain prev links.
 */
export function alignFixtureMustPassBoundary41To42(args: {
  seals: Seal[];
  canonical_assignments: Record<string, string>;
  clean_block_numbers: number[];
}): void {
  const fromId = resolveCanonicalSealIdForBlock({
    block_number: 41,
    canonical_assignments: args.canonical_assignments,
    seals: args.seals,
    clean_block_numbers: args.clean_block_numbers,
  });
  const toId = args.canonical_assignments['42'];
  if (!fromId || !toId) return;

  const fromSeal = args.seals.find((s) => s.seal_id === fromId);
  const toSeal = args.seals.find((s) => s.seal_id === toId);
  if (!fromSeal || !toSeal) return;

  toSeal.prev_seal_hash = fromSeal.seal_hash;
}

export function isDeferredBoundaryEdge(from_block: number, to_block: number): boolean {
  return DEFERRED_BOUNDARY_EDGES.some(([from, to]) => from === from_block && to === to_block);
}
