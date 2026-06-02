import { runSignalEngine } from '@/lib/signals/engine';
import type { DalResult } from '@/lib/dal/types';
import { degradedDalResult, okDalResult, nowIso } from '@/lib/dal/types';

export type SignalsDalSnapshot = {
  signal_count: number;
  tripwire_active: boolean;
  tripwire_level: string;
  top_categories: string[];
  timestamp: string;
};

/**
 * C-303 Phase 1 — Signals DAL reader.
 * Additive scaffold. Wraps the canonical in-process signal engine so chambers
 * can read signal state without self-fetch.
 */
export async function readSignalsDalSnapshot(): Promise<DalResult<SignalsDalSnapshot>> {
  try {
    const { signals, tripwire } = await runSignalEngine();

    const categoryCounts = new Map<string, number>();
    for (const s of signals) {
      const cat = (s as { category?: string }).category ?? 'uncategorized';
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
    const top_categories = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    return okDalResult(
      {
        signal_count: signals.length,
        tripwire_active: tripwire.active,
        tripwire_level: tripwire.level,
        top_categories,
        timestamp: nowIso(),
      },
      {
        source: 'computed',
        freshness: 'live',
        timestamp: nowIso(),
        note: 'Signals DAL scaffold sourced from canonical signal engine',
      },
    );
  } catch (error) {
    return degradedDalResult<SignalsDalSnapshot>({
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_signals_dal_error',
      note: 'Signals DAL scaffold degraded during additive extraction',
    });
  }
}
