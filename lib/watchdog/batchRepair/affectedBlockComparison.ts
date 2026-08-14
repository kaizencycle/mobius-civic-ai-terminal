import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';
import {
  COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION,
  type CollisionAffectedBlockSnapshot,
} from '@/lib/vault/collision-affected-blocks';

/** Maximum age of an affected-block audit artifact relative to capture time. */
export const AFFECTED_BLOCK_ARTIFACT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type AffectedBlockSetComparison = {
  pinned_block_numbers: number[];
  live_block_numbers: number[] | null;
  missing_from_live: number[];
  unexpected_in_live: number[];
  duplicate_live_positions: number[];
  set_match: boolean;
  live_artifact_present: boolean;
  live_artifact_authenticated: boolean;
  live_artifact_fresh: boolean;
  live_artifact_stale: boolean;
  live_source: string | null;
  audited_at: string | null;
  capture_observed_at: string;
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

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function hashAffectedBlockNumbers(blockNumbers: readonly number[]): string {
  return hashObject({ affected_block_numbers: normalizeBlockNumbers([...blockNumbers]) });
}

export function validateAffectedBlockArtifactFreshness(args: {
  live_snapshot: CollisionAffectedBlockSnapshot;
  capture_observed_at: string;
  collision_pair_count_live?: number | null;
  operator_cycle?: string | null;
}): { fresh: boolean; stale: boolean; errors: string[] } {
  const errors: string[] = [];
  const captureMs = parseIsoMs(args.capture_observed_at);
  const auditedMs = parseIsoMs(args.live_snapshot.audited_at);

  if (args.live_snapshot.schema_version !== COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION) {
    errors.push(
      `live affected-block artifact schema_version must be ${COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION}`,
    );
  }
  if (auditedMs === null) {
    errors.push('live affected-block artifact missing or invalid audited_at');
  }
  if (captureMs === null) {
    errors.push('capture_observed_at must be a valid ISO timestamp');
  }
  if (auditedMs !== null && captureMs !== null) {
    if (auditedMs > captureMs) {
      errors.push('live affected-block artifact audited_at is after capture_observed_at');
    } else if (captureMs - auditedMs > AFFECTED_BLOCK_ARTIFACT_MAX_AGE_MS) {
      errors.push(
        `live affected-block artifact stale — audited_at predates capture by more than ${AFFECTED_BLOCK_ARTIFACT_MAX_AGE_MS / 3_600_000}h (cached artifact label required)`,
      );
    }
  }

  if (
    args.collision_pair_count_live != null &&
    args.live_snapshot.hash_divergent_pair_count !== args.collision_pair_count_live
  ) {
    errors.push(
      `hash_divergent_pair_count (${args.live_snapshot.hash_divergent_pair_count}) inconsistent with live collision_pair_count (${args.collision_pair_count_live})`,
    );
  }

  const stale = errors.some((e) => e.includes('stale'));
  return { fresh: errors.length === 0, stale, errors };
}

export function compareAffectedBlockSets(args: {
  pinned_block_numbers: readonly number[];
  live_snapshot: CollisionAffectedBlockSnapshot | null | undefined;
  live_source: string | null;
  capture_observed_at: string;
  collision_pair_count_live?: number | null;
  operator_cycle?: string | null;
}): AffectedBlockSetComparison {
  const errors: string[] = [];
  const pinned = normalizeBlockNumbers([...args.pinned_block_numbers]);
  const liveRaw = args.live_snapshot?.affected_block_numbers ?? null;
  const live = liveRaw ? normalizeBlockNumbers(liveRaw) : null;
  const duplicate_live_positions = live ? findDuplicates(liveRaw ?? []) : [];
  let live_artifact_fresh = false;
  let live_artifact_stale = false;

  if (!args.live_snapshot) {
    errors.push('live affected-block artifact missing from authoritative watchdog/status evidence');
  } else if (!Array.isArray(args.live_snapshot.affected_block_numbers)) {
    errors.push('live affected-block artifact malformed: affected_block_numbers must be an array');
  } else if (args.live_snapshot.affected_block_numbers.length === 0) {
    errors.push('live affected-block artifact empty — count-only validation is insufficient');
  } else {
    const freshness = validateAffectedBlockArtifactFreshness({
      live_snapshot: args.live_snapshot,
      capture_observed_at: args.capture_observed_at,
      collision_pair_count_live: args.collision_pair_count_live,
      operator_cycle: args.operator_cycle,
    });
    live_artifact_fresh = freshness.fresh;
    live_artifact_stale = freshness.stale;
    errors.push(...freshness.errors);
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
    duplicate_live_positions.length === 0 &&
    live_artifact_fresh;

  return {
    pinned_block_numbers: pinned,
    live_block_numbers: live,
    missing_from_live,
    unexpected_in_live,
    duplicate_live_positions,
    set_match,
    live_artifact_present: args.live_snapshot != null,
    live_artifact_authenticated: args.live_source != null && args.live_snapshot != null,
    live_artifact_fresh,
    live_artifact_stale,
    live_source: args.live_source,
    audited_at: args.live_snapshot?.audited_at ?? null,
    capture_observed_at: args.capture_observed_at,
    pinned_contested_count: pinned.length,
    live_contested_count: live?.length ?? null,
    collision_pair_count_live: args.collision_pair_count_live ?? null,
    errors,
  };
}
