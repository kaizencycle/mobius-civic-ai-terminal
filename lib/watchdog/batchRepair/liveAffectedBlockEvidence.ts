import { analyzeReserveBlockCollisions } from '@/lib/dat/reserveBlockCollisions';
import {
  buildCollisionAffectedBlockSnapshot,
  type CollisionAffectedBlockSnapshot,
} from '@/lib/vault/collision-affected-blocks';
import { loadCollisionAffectedBlockSnapshotPrimaryOnly } from '@/lib/vault/collision-affected-blocks-store';
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
  /** Blocking failures only — must not invalidate a successful primary derivation. */
  errors: string[];
  /** Informational audit trail (e.g. empty watchdog snapshot superseded by derivation). */
  notes: string[];
};

const WATCHDOG_KV_SOURCE = 'kv:primary:mobius:watchdog:collision:affected-blocks';
const PRIMARY_KV_DERIVED_SOURCE = 'kv:primary-vault-v2:derived-collision-affected-blocks';

async function deriveAffectedBlockSnapshotFromPrimaryKv(args: {
  capture_observed_at: string;
  operator_cycle?: string | null;
}): Promise<{
  snapshot: CollisionAffectedBlockSnapshot | null;
  errors: string[];
}> {
  const errors: string[] = [];

  const allIds = await listAllSealIdsPrimaryOnly();
  if (allIds.length === 0) {
    errors.push('primary KV audit index empty — cannot derive live affected-block set');
    return { snapshot: null, errors };
  }

  const primaryReads = await getSealsByIdsPrimaryOnly(allIds);
  const seals = liveSealsFromPrimaryReads(primaryReads);
  if (seals.length === 0) {
    errors.push('primary KV returned zero readable seal bodies — cannot derive live affected-block set');
    return { snapshot: null, errors };
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
    return { snapshot: null, errors };
  }

  return { snapshot, errors: [] };
}

/** Load live contested-block set from production KV — never from pinned Track R fixture. */
export async function loadAuthoritativeLiveAffectedBlockEvidence(args: {
  capture_observed_at: string;
  operator_cycle?: string | null;
}): Promise<LiveAffectedBlockEvidence> {
  const notes: string[] = [];

  if (!hasUpstashKvCredentials()) {
    return {
      snapshot: null,
      source: null,
      derived_from_primary_kv: false,
      errors: ['authenticated KV credentials unavailable — cannot load live affected-block evidence'],
      notes,
    };
  }

  const stored = await loadCollisionAffectedBlockSnapshotPrimaryOnly();
  if (stored && stored.affected_block_numbers.length > 0) {
    return {
      snapshot: stored,
      source: WATCHDOG_KV_SOURCE,
      derived_from_primary_kv: false,
      errors: [],
      notes,
    };
  }

  if (stored && stored.affected_block_numbers.length === 0) {
    notes.push('watchdog primary KV affected-block snapshot present but empty — deriving from vault seal scan');
  } else {
    notes.push('watchdog primary KV affected-block snapshot missing — deriving from vault seal scan');
  }

  const derived = await deriveAffectedBlockSnapshotFromPrimaryKv(args);
  if (derived.snapshot) {
    return {
      snapshot: derived.snapshot,
      source: PRIMARY_KV_DERIVED_SOURCE,
      derived_from_primary_kv: true,
      errors: [],
      notes,
    };
  }

  return {
    snapshot: null,
    source: null,
    derived_from_primary_kv: true,
    errors: derived.errors,
    notes,
  };
}
