/**
 * C-425 — Make Track R canonical lineage authoritative for Reserve Block
 * collision gating.
 *
 * Bridges the raw collision detector (`lib/dat/reserveBlockCollisions.ts`)
 * against the fail-closed C-373 resolver (`lib/watchdog/canonicalLineageResolve.ts`),
 * fed by the *effective* Track R lineage (`lib/watchdog/effectiveCanonicalLineage.ts`)
 * instead of the C-373 flat index — because Track R's actual live-apply path
 * writes `watchdog:lineage:*` (see `lib/watchdog/batchRepair/runBatchApply.ts`'s
 * `liveWriteArmed` branch), not `watchdog:canonical:*`.
 *
 * Historical raw collisions are never hidden: `raw_collision_count` always
 * reflects every hash-divergent pair currently in KV, resolved or not.
 * `unresolved_collision_count` is the only figure that should ever gate.
 */

import type { Seal } from '@/lib/vault-v2/types';
import { analyzeReserveBlockCollisions, type BlockCollision } from '@/lib/dat/reserveBlockCollisions';
import { resolveCanonicalLineageCandidates } from '@/lib/watchdog/canonicalLineageResolve';
import {
  getEffectiveCanonicalLineage,
  type EffectiveCanonicalLineage,
  type LineageKvReader,
} from '@/lib/watchdog/effectiveCanonicalLineage';

export type LineageAwareCollisionReport = {
  /** Every hash-divergent collision pair currently in attested KV. Never hidden. */
  raw_collision_count: number;
  /** Hash-divergent pairs whose block is resolved under valid active Track R lineage. */
  resolved_collision_count: number;
  /** Hash-divergent pairs NOT covered by a valid, internally-consistent active lineage. Gates. */
  unresolved_collision_count: number;
  /** Non-hash-divergent duplicate pairs — never gate, kept for observability only. */
  non_hash_divergent_collision_count: number;
  unresolved_block_numbers: number[];
  active_track_r_version: string | null;
  lineage_trusted: boolean;
  lineage_failure_reason: string | null;
  collisions: BlockCollision[];
};

/**
 * Pure classification: given raw seals and an already-loaded (or already-failed)
 * effective lineage snapshot, distinguish resolved from unresolved collisions.
 * No KV access here — this is the function the regression tests exercise directly.
 */
export function classifyCollisionsAgainstLineage(args: {
  seals: Seal[];
  lineage: EffectiveCanonicalLineage;
}): LineageAwareCollisionReport {
  const raw = analyzeReserveBlockCollisions(args.seals);
  const hashDivergent = raw.collisions.filter((c) => c.seal_hashes_differ);
  const nonHashDivergentCount = raw.collision_count - hashDivergent.length;

  if (!args.lineage.ok) {
    // Fail closed: no trustworthy lineage means nothing is proven resolved.
    const unresolved_block_numbers = [...new Set(hashDivergent.map((c) => c.block_number))].sort(
      (a, b) => a - b,
    );
    return {
      raw_collision_count: hashDivergent.length,
      resolved_collision_count: 0,
      unresolved_collision_count: hashDivergent.length,
      non_hash_divergent_collision_count: nonHashDivergentCount,
      unresolved_block_numbers,
      active_track_r_version: args.lineage.active_version,
      lineage_trusted: false,
      lineage_failure_reason: args.lineage.reason,
      collisions: raw.collisions,
    };
  }

  const { unresolved_blocks } = resolveCanonicalLineageCandidates({
    seals: args.seals,
    quarantined: args.lineage.quarantined,
    canonicalIndex: args.lineage.canonical_index,
  });
  const unresolvedSet = new Set(unresolved_blocks);

  let resolved = 0;
  let unresolved = 0;
  for (const collision of hashDivergent) {
    if (unresolvedSet.has(collision.block_number)) {
      unresolved += 1;
    } else {
      resolved += 1;
    }
  }

  return {
    raw_collision_count: hashDivergent.length,
    resolved_collision_count: resolved,
    unresolved_collision_count: unresolved,
    non_hash_divergent_collision_count: nonHashDivergentCount,
    unresolved_block_numbers: [...unresolvedSet].sort((a, b) => a - b),
    active_track_r_version: args.lineage.active_version,
    lineage_trusted: true,
    lineage_failure_reason: null,
    collisions: raw.collisions,
  };
}

/**
 * KV-integrated entry point: loads the effective lineage, then classifies.
 * `reader` is a test hook — production callers omit it and get real KV.
 */
export async function loadLineageAwareCollisionReport(
  seals: Seal[],
  reader?: LineageKvReader,
): Promise<LineageAwareCollisionReport> {
  const lineage = await getEffectiveCanonicalLineage(reader);
  return classifyCollisionsAgainstLineage({ seals, lineage });
}
