import { analyzeReserveBlockCollisions } from '@/lib/dat/reserveBlockCollisions';
import {
  buildCollisionAffectedBlockSnapshot,
  type CollisionAffectedBlockSnapshot,
} from '@/lib/vault/collision-affected-blocks';
import { loadCollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks-store';
import {
  getSealsByIdsPrimaryOnly,
  listAllSealIdsPrimaryOnly,
} from '@/lib/vault-v2/store';
import { liveSealsFromPrimaryReads } from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';
import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';

export type LiveAffectedBlockEvidence = {
  snapshot: CollisionAffectedBlockSnapshot | null;
  source: string | null;
  derived_from_primary_kv: boolean;
  errors: string[];
};

const WATCHDOG_KV_SOURCE = 'kv:mobius:watchdog:collision:affected-blocks';
const PRIMARY_KV_DERIVED_SOURCE = 'kv:primary-vault-v2:derived-collision-affected-blocks';

/** Load live contested-block set from production KV — never from pinned Track R fixture. */
export async function loadAuthoritativeLiveAffectedBlockEvidence(args: {
  capture_observed_at: string;
  operator_cycle?: string | null;
}): Promise<LiveAffectedBlockEvidence> {
  const errors: string[] = [];

  if (!hasUpstashKvCredentials()) {
    return {
      snapshot: null,
      source: null,
      derived_from_primary_kv: false,
      errors: ['authenticated KV credentials unavailable — cannot load live affected-block evidence'],
    };
  }

  const stored = await loadCollisionAffectedBlockSnapshot();
  if (stored && stored.affected_block_numbers.length > 0) {
    return {
      snapshot: stored,
      source: WATCHDOG_KV_SOURCE,
      derived_from_primary_kv: false,
      errors,
    };
  }

  if (stored && stored.affected_block_numbers.length === 0) {
    errors.push('watchdog KV affected-block snapshot present but empty');
  } else {
    errors.push('watchdog KV affected-block snapshot missing — attempting primary KV derivation');
  }

  const allIds = await listAllSealIdsPrimaryOnly();
  if (allIds.length === 0) {
    errors.push('primary KV audit index empty — cannot derive live affected-block set');
    return {
      snapshot: null,
      source: null,
      derived_from_primary_kv: false,
      errors,
    };
  }

  const primaryReads = await getSealsByIdsPrimaryOnly(allIds);
  const seals = liveSealsFromPrimaryReads(primaryReads);
  if (seals.length === 0) {
    errors.push('primary KV returned zero readable seal bodies — cannot derive live affected-block set');
    return {
      snapshot: null,
      source: null,
      derived_from_primary_kv: false,
      errors,
    };
  }

  const report = analyzeReserveBlockCollisions(seals);
  const snapshot = buildCollisionAffectedBlockSnapshot({
    report,
    seals,
    operator_cycle: args.operator_cycle ?? undefined,
    audited_at: args.capture_observed_at,
  });

  if (snapshot.affected_block_numbers.length === 0) {
    errors.push('primary KV derivation produced empty affected_block_numbers');
    return {
      snapshot: null,
      source: null,
      derived_from_primary_kv: true,
      errors,
    };
  }

  return {
    snapshot,
    source: PRIMARY_KV_DERIVED_SOURCE,
    derived_from_primary_kv: true,
    errors: errors.filter((e) => !e.includes('attempting primary KV derivation')),
  };
}
