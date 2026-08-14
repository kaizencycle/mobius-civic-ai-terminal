/**
 * Server-only KV persistence for collision-affected block snapshots.
 */

import { kvGet, kvGetPrimaryOnly, kvSet } from '@/lib/kv/store';
import {
  COLLISION_AFFECTED_BLOCKS_KEY,
  COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION,
  type CollisionAffectedBlockSnapshot,
} from '@/lib/vault/collision-affected-blocks';

function parseCollisionAffectedBlockSnapshot(
  stored: CollisionAffectedBlockSnapshot | null | undefined,
): CollisionAffectedBlockSnapshot | null {
  if (!stored || stored.schema_version !== COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION) {
    return null;
  }
  if (!Array.isArray(stored.affected_block_numbers)) {
    return null;
  }
  return stored;
}

export async function loadCollisionAffectedBlockSnapshot(): Promise<CollisionAffectedBlockSnapshot | null> {
  const stored = await kvGet<CollisionAffectedBlockSnapshot>(COLLISION_AFFECTED_BLOCKS_KEY);
  return parseCollisionAffectedBlockSnapshot(stored);
}

/** Primary Upstash only — no backup Redis or KV bridge fallback (Track R live evidence). */
export async function loadCollisionAffectedBlockSnapshotPrimaryOnly(): Promise<CollisionAffectedBlockSnapshot | null> {
  const stored = await kvGetPrimaryOnly<CollisionAffectedBlockSnapshot>(
    COLLISION_AFFECTED_BLOCKS_KEY,
  );
  return parseCollisionAffectedBlockSnapshot(stored);
}

export async function saveCollisionAffectedBlockSnapshot(
  snapshot: CollisionAffectedBlockSnapshot,
): Promise<void> {
  await kvSet(COLLISION_AFFECTED_BLOCKS_KEY, snapshot);
}
