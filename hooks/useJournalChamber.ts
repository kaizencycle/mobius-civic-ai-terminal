'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export type JournalChamberPayload = {
  ok: boolean;
  mode: 'hot' | 'canon' | 'merged';
  entries: unknown[];
  canonical_available: boolean;
  fallback: boolean;
  timestamp: string;
};

export function useJournalChamber(enabled: boolean, mode: 'hot' | 'canon' | 'merged', limit = 100) {
  const { snapshot } = useTerminalSnapshot();
  const url = useMemo(() => `/api/chambers/journal?mode=${mode}&limit=${limit}`, [mode, limit]);
  const preview = useMemo(() => {
    const summary = snapshot?.journal_summary;
    if (!summary || typeof summary !== 'object') return null;
    const latest = (summary as { latest_agent_entries?: unknown[] }).latest_agent_entries;
    if (!Array.isArray(latest)) return null;
    return {
      ok: true,
      mode,
      entries: latest,
      canonical_available: false,
      fallback: true,
      timestamp: snapshot?.timestamp ?? new Date().toISOString(),
    } satisfies JournalChamberPayload;
  }, [mode, snapshot]);

  return useChamberHydration<JournalChamberPayload>(url, enabled, { previewData: preview });
}
