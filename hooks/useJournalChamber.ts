'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useEchoDigest } from '@/hooks/useEchoDigest';
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
  const { digest } = useEchoDigest(enabled);
  const url = useMemo(() => `/api/chambers/journal?mode=${mode}&limit=${limit}`, [mode, limit]);

  const preview = useMemo(() => {
    const summary = snapshot?.journal_summary;
    const latest = (summary as { latest_agent_entries?: unknown[] } | undefined)?.latest_agent_entries;
    const digestEntries = (digest?.journal_preview.cycles ?? []).map((bucket) => ({
      id: `digest-${bucket.cycle}`,
      cycle: bucket.cycle,
      observation: `Digest cycle bucket · ${bucket.count} entries`,
      timestamp: digest?.timestamp ?? new Date().toISOString(),
      source: 'echo-digest',
    }));

    return {
      ok: true,
      mode,
      entries: Array.isArray(latest) && latest.length > 0 ? latest : digestEntries,
      canonical_available: false,
      fallback: true,
      timestamp: digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString(),
    } satisfies JournalChamberPayload;
  }, [mode, snapshot, digest]);

  return useChamberHydration<JournalChamberPayload>(url, enabled, { previewData: preview });
}
