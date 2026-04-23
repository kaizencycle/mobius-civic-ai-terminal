/**
 * Canonical operator cycle for seal IDs and vault cron: prefer KV (ECHO /
 * tripwire), else deterministic calendar cycle from `currentCycleId`.
 */

import { currentCycleId } from '@/lib/eve/cycle-engine';
import { loadEchoState, loadTripwireState } from '@/lib/kv/store';

export async function resolveOperatorCycleId(): Promise<string> {
  try {
    const [echo, trip] = await Promise.all([loadEchoState(), loadTripwireState()]);
    if (echo?.cycleId?.trim()) return echo.cycleId.trim();
    if (trip?.cycleId?.trim()) return trip.cycleId.trim();
  } catch {
    // fall through to engine
  }
  return currentCycleId();
}
