/**
 * C-377 — Collision-affected block set (read-only audit artifact).
 *
 * Membership is produced by `scripts/audit-reserve-block-collisions.ts` and
 * consumed by /api/vault/status + Vault UI. UI must never recompute contested
 * slots from index cardinality.
 */

import type { Seal } from '@/lib/vault-v2/types';
import type { ReserveBlockCollisionReport } from '@/lib/dat/reserveBlockCollisions';
import { kvGet, kvSet } from '@/lib/kv/store';

export const COLLISION_AFFECTED_BLOCKS_KEY = 'watchdog:collision:affected-blocks';

export const COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION = '1.0' as const;

export type CollisionAffectedBlockSnapshot = {
  schema_version: typeof COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION;
  audited_at: string;
  operator_cycle?: string;
  baseline_run_id?: string;
  hash_divergent_pair_count: number;
  unique_block_count: number;
  raw_attested_count: number;
  /** block_numbers with hash-divergent collision pairs */
  affected_block_numbers: number[];
  /** subset with three or more competing attested seals */
  three_way_blocks: number[];
  /** attested seal count per affected block (audit witness) */
  seal_count_by_block: Record<string, number>;
};

export function countAttestedSealsByBlock(seals: Seal[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const seal of seals) {
    if (seal.status !== 'attested') continue;
    counts.set(seal.sequence, (counts.get(seal.sequence) ?? 0) + 1);
  }
  return counts;
}

export function buildCollisionAffectedBlockSnapshot(args: {
  report: ReserveBlockCollisionReport;
  seals: Seal[];
  operator_cycle?: string;
  baseline_run_id?: string;
  audited_at?: string;
}): CollisionAffectedBlockSnapshot {
  const hashDivergent = args.report.collisions.filter((c) => c.seal_hashes_differ);
  const affectedSet = new Set<number>();
  for (const collision of hashDivergent) {
    affectedSet.add(collision.block_number);
  }

  const sealCounts = countAttestedSealsByBlock(args.seals);
  const affected_block_numbers = [...affectedSet].sort((a, b) => a - b);
  const three_way_blocks = affected_block_numbers.filter(
    (blockNumber) => (sealCounts.get(blockNumber) ?? 0) >= 3,
  );

  const seal_count_by_block: Record<string, number> = {};
  for (const blockNumber of affected_block_numbers) {
    seal_count_by_block[String(blockNumber)] = sealCounts.get(blockNumber) ?? 0;
  }

  return {
    schema_version: COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION,
    audited_at: args.audited_at ?? new Date().toISOString(),
    operator_cycle: args.operator_cycle,
    baseline_run_id: args.baseline_run_id,
    hash_divergent_pair_count: hashDivergent.length,
    unique_block_count: args.report.unique_block_count,
    raw_attested_count: args.report.raw_attested_count,
    affected_block_numbers,
    three_way_blocks,
    seal_count_by_block,
  };
}

export async function loadCollisionAffectedBlockSnapshot(): Promise<CollisionAffectedBlockSnapshot | null> {
  const stored = await kvGet<CollisionAffectedBlockSnapshot>(COLLISION_AFFECTED_BLOCKS_KEY);
  if (!stored || stored.schema_version !== COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION) {
    return null;
  }
  if (!Array.isArray(stored.affected_block_numbers)) {
    return null;
  }
  return stored;
}

export async function saveCollisionAffectedBlockSnapshot(
  snapshot: CollisionAffectedBlockSnapshot,
): Promise<void> {
  await kvSet(COLLISION_AFFECTED_BLOCKS_KEY, snapshot);
}

export function collisionAffectedSets(snapshot: CollisionAffectedBlockSnapshot | null | undefined): {
  affected: ReadonlySet<number>;
  threeWay: ReadonlySet<number>;
} | null {
  if (!snapshot) return null;
  return {
    affected: new Set(snapshot.affected_block_numbers),
    threeWay: new Set(snapshot.three_way_blocks),
  };
}
