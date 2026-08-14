import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';
import type { CollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks';

export type AffectedBlockSetComparison = {
  pinned_block_numbers: number[];
  live_block_numbers: number[] | null;
  missing_from_live: number[];
  unexpected_in_live: number[];
  duplicate_live_positions: number[];
  set_match: boolean;
  live_artifact_present: boolean;
  live_artifact_authenticated: boolean;
  live_source: string | null;
  pinned_contested_count: number;
  live_contested_count: number | null;
  collision_pair_count_live: number | null;
  errors: string[];
};

function normalizeBlockNumbers(values: number[] | null | undefined): number[] {
  if (!values) return [];
  return [...values].sort((a, b) => a - b);
}

function findDuplicates(values: number[]): number[] {
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes].sort((a, b) => a - b);
}

export function hashAffectedBlockNumbers(blockNumbers: readonly number[]): string {
  return hashObject({ affected_block_numbers: normalizeBlockNumbers([...blockNumbers]) });
}

export function compareAffectedBlockSets(args: {
  pinned_block_numbers: readonly number[];
  live_snapshot: CollisionAffectedBlockSnapshot | null | undefined;
  live_source: string | null;
  collision_pair_count_live?: number | null;
}): AffectedBlockSetComparison {
  const errors: string[] = [];
  const pinned = normalizeBlockNumbers([...args.pinned_block_numbers]);
  const liveRaw = args.live_snapshot?.affected_block_numbers ?? null;
  const live = liveRaw ? normalizeBlockNumbers(liveRaw) : null;
  const duplicate_live_positions = live ? findDuplicates(liveRaw ?? []) : [];

  if (!args.live_snapshot) {
    errors.push('live affected-block artifact missing from authoritative watchdog/status evidence');
  } else if (!Array.isArray(args.live_snapshot.affected_block_numbers)) {
    errors.push('live affected-block artifact malformed: affected_block_numbers must be an array');
  } else if (args.live_snapshot.affected_block_numbers.length === 0) {
    errors.push('live affected-block artifact empty — count-only validation is insufficient');
  }

  if (duplicate_live_positions.length > 0) {
    errors.push(`duplicate live affected block positions: ${duplicate_live_positions.join(', ')}`);
  }

  const pinnedSet = new Set(pinned);
  const liveSet = new Set(live ?? []);
  const missing_from_live = pinned.filter((block) => !liveSet.has(block));
  const unexpected_in_live = (live ?? []).filter((block) => !pinnedSet.has(block));

  if (missing_from_live.length > 0) {
    errors.push(`missing_from_live: ${missing_from_live.join(', ')}`);
  }
  if (unexpected_in_live.length > 0) {
    errors.push(`unexpected_in_live: ${unexpected_in_live.join(', ')}`);
  }
  if (live && live.length !== pinned.length) {
    errors.push(
      `contested-position count mismatch: pinned ${pinned.length}, live ${live.length}`,
    );
  }

  const set_match =
    errors.length === 0 &&
    live !== null &&
    missing_from_live.length === 0 &&
    unexpected_in_live.length === 0 &&
    duplicate_live_positions.length === 0;

  return {
    pinned_block_numbers: pinned,
    live_block_numbers: live,
    missing_from_live,
    unexpected_in_live,
    duplicate_live_positions,
    set_match,
    live_artifact_present: args.live_snapshot != null,
    live_artifact_authenticated: args.live_source != null && args.live_snapshot != null,
    live_source: args.live_source,
    pinned_contested_count: pinned.length,
    live_contested_count: live?.length ?? null,
    collision_pair_count_live: args.collision_pair_count_live ?? null,
    errors,
  };
}
