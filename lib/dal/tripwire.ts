import { loadTripwireState } from '@/lib/kv/store';
import { tripwireKvRowToRuntimeState } from '@/lib/tripwire/store';
import type { RuntimeTripwireLevel } from '@/lib/tripwire/store';
import type { DalResult } from '@/lib/dal/types';
import { degradedDalResult, okDalResult, nowIso } from '@/lib/dal/types';

export type TripwireDalSnapshot = {
  active: boolean;
  level: RuntimeTripwireLevel;
  reason: string;
  last_updated: string;
  triggered_by: string | null;
  timestamp: string;
};

/**
 * C-303 Phase 1F — additive tripwire DAL scaffold.
 *
 * C-465 B4: reads the KV-persisted tripwire record, not the runtime
 * in-memory store. Before this fix it called the same `getTripwireState()`
 * the legacy path reads, so parallel-read/tripwire's parity check was
 * tautologically "matched" even when the two authorities had actually
 * diverged (W8) — comparing memory to KV gives a real, non-tautological
 * comparison. `triggered_by` is always null: the KV schema never persists it.
 *
 * It is diagnostic during Phase 1 and does not replace legacy snapshot routing.
 */
export async function readTripwireDalSnapshot(): Promise<DalResult<TripwireDalSnapshot>> {
  try {
    const row = await loadTripwireState();
    if (!row) {
      return degradedDalResult<TripwireDalSnapshot>({
        source: 'kv',
        error: 'no_persisted_tripwire_record',
        note: 'No KV tripwire:state record exists yet — not the same as a confirmed clear.',
      });
    }
    const state = tripwireKvRowToRuntimeState(row);

    return okDalResult(
      {
        active: state.active,
        level: state.level,
        reason: state.reason,
        last_updated: state.last_updated,
        triggered_by: null,
        timestamp: nowIso(),
      },
      {
        source: 'kv',
        freshness: 'live',
        timestamp: nowIso(),
        note: 'Tripwire DAL scaffold sourced from KV (tripwire:state), independent of the runtime in-memory store',
      },
    );
  } catch (error) {
    return degradedDalResult<TripwireDalSnapshot>({
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_tripwire_dal_error',
      note: 'Tripwire DAL scaffold failed during additive phase',
    });
  }
}
