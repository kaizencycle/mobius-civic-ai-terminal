import { getAgentJournalEntries } from '@/lib/agents/journal';
import type { DalResult } from '@/lib/dal/types';
import { degradedDalResult, okDalResult, nowIso } from '@/lib/dal/types';

export type JournalDalSnapshot = {
  entry_count: number;
  latest_cycle: string | null;
  latest_agent: string | null;
  /** 'empty-degraded' distinguishes a real empty from a false empty (seeds Phase 6). */
  active_source: 'kv-journal' | 'empty-degraded';
  timestamp: string;
};

/**
 * C-303 Phase 1 — Journal DAL reader (seeds Phase 6 recovery semantics).
 * Additive scaffold. Reads canonical agent journal entries from KV.
 * Distinguishes a real empty from a populated state and labels which source
 * answered — the Journal lane can never report a false empty.
 */
export async function readJournalDalSnapshot(
  cycle?: string | null,
): Promise<DalResult<JournalDalSnapshot>> {
  try {
    const entries = await getAgentJournalEntries(cycle ? { cycle } : undefined);

    const latest = entries.length > 0 ? entries[0] : null;
    const active_source: JournalDalSnapshot['active_source'] =
      entries.length > 0 ? 'kv-journal' : 'empty-degraded';

    return okDalResult(
      {
        entry_count: entries.length,
        latest_cycle: (latest as { cycle?: string } | null)?.cycle ?? null,
        latest_agent: (latest as { agent?: string } | null)?.agent ?? null,
        active_source,
        timestamp: nowIso(),
      },
      {
        source: 'kv',
        // An empty journal is a real degraded state, not a failure — surface it.
        freshness: entries.length > 0 ? 'live' : 'stale',
        timestamp: nowIso(),
        note:
          entries.length > 0
            ? 'Journal DAL scaffold sourced from KV agent journals'
            : 'Journal DAL: no entries for scope — explicit empty (not a false empty)',
      },
    );
  } catch (error) {
    return degradedDalResult<JournalDalSnapshot>({
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_journal_dal_error',
      note: 'Journal DAL scaffold degraded during additive extraction',
    });
  }
}
