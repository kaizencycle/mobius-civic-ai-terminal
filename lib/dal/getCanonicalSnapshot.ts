import type { DalProvenance, DalResult } from '@/lib/dal/types';
import { nowIso } from '@/lib/dal/types';
import { readVaultDalSnapshot, type VaultDalSnapshot } from '@/lib/dal/vault';
import { readIntegrityDalSnapshot, type IntegrityDalSnapshot } from '@/lib/dal/integrity';
import { readSignalsDalSnapshot, type SignalsDalSnapshot } from '@/lib/dal/signals';
import { readLedgerDalSnapshot, type LedgerDalSnapshot } from '@/lib/dal/ledger';
import { readJournalDalSnapshot, type JournalDalSnapshot } from '@/lib/dal/journal';
import { readSentinelDalSnapshot, type SentinelDalSnapshot } from '@/lib/dal/sentinel';

/**
 * C-303 Phase 2 — Canonical Snapshot Unification.
 *
 * One shared, typed snapshot derived entirely from the canonical DAL readers
 * (Phase 1). No internal HTTP, no client hydration timing — derivation is
 * testable outside React (Phase 2 acceptance criterion). Each lane carries its
 * own provenance (Phase 5 acceptance: the UI can explain where a value came from).
 *
 * ADDITIVE: not yet wired into /api/terminal/snapshot. The existing route is
 * untouched; migration is a follow-up phase so each step stays merge-safe.
 */

export type LaneEnvelope<T> = {
  ok: boolean;
  data: T | null;
  provenance: DalProvenance;
};

export type CanonicalSnapshot = {
  cycle: string;
  generated_at: string;
  /** True when any lane is degraded — never hides a degraded lane. */
  degraded: boolean;
  degraded_lanes: string[];
  lanes: {
    integrity: LaneEnvelope<IntegrityDalSnapshot>;
    vault: LaneEnvelope<VaultDalSnapshot>;
    signals: LaneEnvelope<SignalsDalSnapshot>;
    ledger: LaneEnvelope<LedgerDalSnapshot>;
    journal: LaneEnvelope<JournalDalSnapshot>;
    sentinel: LaneEnvelope<SentinelDalSnapshot>;
  };
};

function toEnvelope<T>(r: DalResult<T>): LaneEnvelope<T> {
  return { ok: r.ok, data: r.data, provenance: r.provenance };
}

/**
 * Build the canonical snapshot. GI is read first (cheap) and threaded into the
 * vault reader so the vault lane reflects current integrity, matching the live
 * route's ordering. All other lanes run in parallel; one lane failing degrades
 * only that lane, never the whole snapshot.
 */
export async function getCanonicalSnapshot(cycle = 'C-303'): Promise<CanonicalSnapshot> {
  const integrity = await readIntegrityDalSnapshot();
  const giCurrent =
    (integrity.data as { global_integrity?: number | null } | null)?.global_integrity ?? null;

  const [vault, signals, ledger, journal, sentinel] = await Promise.all([
    readVaultDalSnapshot(giCurrent),
    readSignalsDalSnapshot(),
    readLedgerDalSnapshot(),
    readJournalDalSnapshot(cycle),
    readSentinelDalSnapshot(),
  ]);

  const lanes = {
    integrity: toEnvelope(integrity),
    vault: toEnvelope(vault),
    signals: toEnvelope(signals),
    ledger: toEnvelope(ledger),
    journal: toEnvelope(journal),
    sentinel: toEnvelope(sentinel),
  };

  const degraded_lanes = Object.entries(lanes)
    .filter(([, env]) => !env.ok || env.provenance.freshness !== 'live')
    .map(([name]) => name);

  return {
    cycle,
    generated_at: nowIso(),
    degraded: degraded_lanes.length > 0,
    degraded_lanes,
    lanes,
  };
}
