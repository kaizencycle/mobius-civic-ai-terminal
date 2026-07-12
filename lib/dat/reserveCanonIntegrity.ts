/**
 * Hot KV vs cold Substrate integrity — count gap + duplicate block_number collisions.
 * EPICON: C-370 item 6
 */

import { fetchAllSealedBlocks } from '@/lib/vault/fetchAllSealedBlocks';
import { analyzeReserveBlockCollisions } from '@/lib/dat/reserveBlockCollisions';
import { fetchCanonGap, type CanonGapSnapshot } from '@/lib/dat/substrateCanonGap';
import { listAllSeals } from '@/lib/vault-v2/store';

export interface ReserveCanonIntegritySnapshot extends CanonGapSnapshot {
  raw_attested_seals: number;
  unique_block_numbers: number;
  collision_count: number;
  collisions_sample: Array<{
    block_number: number;
    kept_seal_id: string;
    dropped_seal_id: string;
    seal_hashes_differ: boolean;
  }>;
  integrity_ok: boolean;
  issues: string[];
}

const COLLISION_SAMPLE_LIMIT = 10;
const COLLISION_ALERT_THRESHOLD = 0;

export async function fetchReserveCanonIntegrity(options?: {
  terminalUrl?: string;
  manifestUrl?: string;
}): Promise<ReserveCanonIntegritySnapshot> {
  const [gap, seals, fetchResult] = await Promise.all([
    fetchCanonGap(options),
    listAllSeals(10_000),
    fetchAllSealedBlocks({ verbose: false }),
  ]);

  const collisionReport = analyzeReserveBlockCollisions(seals, {
    alertThreshold: COLLISION_ALERT_THRESHOLD,
  });

  const sealedHotUnique = collisionReport.unique_block_count;
  const gapUnique = Math.max(0, sealedHotUnique - gap.canonized_cold);

  const issues: string[] = [];

  if (!gap.manifest_present) {
    issues.push('cold_manifest_missing');
  }

  if (gapUnique > 0) {
    issues.push(`hot_cold_gap:${gapUnique}`);
  }

  if (collisionReport.alert) {
    issues.push(`block_number_collisions:${collisionReport.collision_count}`);
  }

  const hashDivergent = collisionReport.collisions.filter((c) => c.seal_hashes_differ);
  if (hashDivergent.length > 0) {
    issues.push(`collision_hash_divergence:${hashDivergent.length}`);
  }

  const uniqueFromFetch = fetchResult.blocks.length;
  if (uniqueFromFetch !== collisionReport.unique_block_count) {
    issues.push(`unique_count_mismatch:fetch=${uniqueFromFetch},analyze=${collisionReport.unique_block_count}`);
  }

  const expectedCold = collisionReport.unique_block_count;
  if (gap.manifest_present && gap.canonized_cold !== expectedCold && gap.gap === 0) {
    issues.push(`cold_manifest_count_mismatch:manifest=${gap.canonized_cold},unique=${expectedCold}`);
  }

  return {
    ...gap,
    sealed_hot_unique: sealedHotUnique,
    gap: gapUnique,
    raw_attested_seals: collisionReport.raw_attested_count,
    unique_block_numbers: collisionReport.unique_block_count,
    collision_count: collisionReport.collision_count,
    collisions_sample: collisionReport.collisions.slice(0, COLLISION_SAMPLE_LIMIT).map((c) => ({
      block_number: c.block_number,
      kept_seal_id: c.kept_seal_id,
      dropped_seal_id: c.dropped_seal_id,
      seal_hashes_differ: c.seal_hashes_differ,
    })),
    integrity_ok: issues.length === 0,
    issues,
  };
}
