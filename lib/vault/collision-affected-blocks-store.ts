/**
 * Server-only KV persistence for collision-affected block snapshots.
 */

import { kvGet, kvGetPrimaryOnly, kvSet } from '@/lib/kv/store';
import {
  buildAffectedBlockSnapshotFromSeals,
  COLLISION_AFFECTED_BLOCKS_KEY,
  COLLISION_AFFECTED_BLOCKS_SCHEMA_VERSION,
  type CollisionAffectedBlockSnapshot,
} from '@/lib/vault/collision-affected-blocks';
import { liveSealsFromPrimaryReads } from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';
import { getSealsByIdsPrimaryOnly, listAllSealIdsPrimaryOnly } from '@/lib/vault-v2/store';
import type { Seal } from '@/lib/vault-v2/types';

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

export type RefreshCollisionAffectedBlockSnapshotResult = {
  written: boolean;
  snapshot: CollisionAffectedBlockSnapshot | null;
  errors: string[];
  seal_count: number;
};

export async function loadPrimaryAttestedSealsForCollisionAudit(): Promise<{
  seals: Seal[];
  errors: string[];
}> {
  const allIds = await listAllSealIdsPrimaryOnly();
  if (allIds.length === 0) {
    return { seals: [], errors: ['primary KV audit index empty'] };
  }

  const primaryReads = await getSealsByIdsPrimaryOnly(allIds);
  const seals = liveSealsFromPrimaryReads(primaryReads);
  if (seals.length === 0) {
    return { seals: [], errors: ['primary KV returned zero readable attested seal bodies'] };
  }

  return { seals, errors: [] };
}

/** Derive + persist contested-block set from primary Upstash seal scan (Option B observability). */
export async function refreshCollisionAffectedBlockSnapshotFromPrimaryKv(args?: {
  operator_cycle?: string;
  baseline_run_id?: string;
  audited_at?: string;
}): Promise<RefreshCollisionAffectedBlockSnapshotResult> {
  const loaded = await loadPrimaryAttestedSealsForCollisionAudit();
  if (loaded.errors.length > 0) {
    return {
      written: false,
      snapshot: null,
      errors: loaded.errors,
      seal_count: 0,
    };
  }

  const snapshot = buildAffectedBlockSnapshotFromSeals({
    seals: loaded.seals,
    operator_cycle: args?.operator_cycle,
    baseline_run_id: args?.baseline_run_id,
    audited_at: args?.audited_at,
  });

  if (snapshot.affected_block_numbers.length === 0) {
    return {
      written: false,
      snapshot: null,
      errors: ['primary KV derivation produced empty affected_block_numbers'],
      seal_count: loaded.seals.length,
    };
  }

  await saveCollisionAffectedBlockSnapshot(snapshot);
  return {
    written: true,
    snapshot,
    errors: [],
    seal_count: loaded.seals.length,
  };
}
