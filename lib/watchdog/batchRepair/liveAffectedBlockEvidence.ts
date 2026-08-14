import {
  loadCollisionAffectedBlockSnapshotPrimaryOnly,
  loadPrimaryAttestedSealsForCollisionAudit,
} from '@/lib/vault/collision-affected-blocks-store';
import {
  buildAffectedBlockSnapshotFromSeals,
  type CollisionAffectedBlockSnapshot,
} from '@/lib/vault/collision-affected-blocks';
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

/** Non-empty watchdog snapshots are stale when primary derivation is now empty (post-clearance). */
export function shouldPreferWatchdogAffectedBlockSnapshot(args: {
  stored: CollisionAffectedBlockSnapshot | null;
  derived: CollisionAffectedBlockSnapshot;
}): boolean {
  if (!args.stored || args.stored.affected_block_numbers.length === 0) return false;
  if (args.derived.affected_block_numbers.length === 0) return false;
  return true;
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
  const loaded = await loadPrimaryAttestedSealsForCollisionAudit();
  if (loaded.errors.length > 0) {
    if (stored && stored.affected_block_numbers.length > 0) {
      return {
        snapshot: stored,
        source: WATCHDOG_KV_SOURCE,
        derived_from_primary_kv: false,
        errors: [],
        notes,
      };
    }
    return {
      snapshot: null,
      source: null,
      derived_from_primary_kv: false,
      errors: loaded.errors,
      notes,
    };
  }

  const derived = buildAffectedBlockSnapshotFromSeals({
    seals: loaded.seals,
    operator_cycle: args.operator_cycle ?? undefined,
    audited_at: args.capture_observed_at,
  });

  if (shouldPreferWatchdogAffectedBlockSnapshot({ stored, derived })) {
    return {
      snapshot: stored,
      source: WATCHDOG_KV_SOURCE,
      derived_from_primary_kv: false,
      errors: [],
      notes,
    };
  }

  if (stored && stored.affected_block_numbers.length > 0 && derived.affected_block_numbers.length === 0) {
    notes.push(
      'watchdog primary KV affected-block snapshot stale (non-empty) — primary derivation now empty',
    );
  } else if (stored && stored.affected_block_numbers.length === 0) {
    notes.push('watchdog primary KV affected-block snapshot present but empty — deriving from vault seal scan');
  } else if (!stored) {
    notes.push('watchdog primary KV affected-block snapshot missing — deriving from vault seal scan');
  }

  if (derived.affected_block_numbers.length === 0) {
    return {
      snapshot: null,
      source: null,
      derived_from_primary_kv: true,
      errors: ['primary KV derivation produced empty affected_block_numbers'],
      notes,
    };
  }

  return {
    snapshot: derived,
    source: PRIMARY_KV_DERIVED_SOURCE,
    derived_from_primary_kv: true,
    errors: [],
    notes,
  };
}
