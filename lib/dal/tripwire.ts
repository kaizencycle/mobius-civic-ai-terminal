import { getTripwireState } from '@/lib/tripwire/store';
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
 * Reads the existing runtime tripwire store directly.
 * It is diagnostic during Phase 1 and does not replace legacy snapshot routing.
 */
export async function readTripwireDalSnapshot(): Promise<DalResult<TripwireDalSnapshot>> {
  try {
    const state = getTripwireState();

    return okDalResult(
      {
        active: state.active,
        level: state.level,
        reason: state.reason,
        last_updated: state.last_updated,
        triggered_by: state.triggeredBy ?? null,
        timestamp: nowIso(),
      },
      {
        source: 'computed',
        freshness: 'live',
        timestamp: nowIso(),
        note: 'Tripwire DAL scaffold sourced from runtime tripwire store',
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
