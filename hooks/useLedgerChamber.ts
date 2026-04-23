'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useEchoDigest } from '@/hooks/useEchoDigest';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import type { LedgerEntry } from '@/lib/terminal/types';

export type LedgerChamberPayload = {
  ok: boolean;
  events: LedgerEntry[];
  candidates: { pending: number; confirmed: number; contested: number };
  fallback: boolean;
  timestamp: string;
};

export function useLedgerChamber(enabled: boolean) {
  const { snapshot } = useTerminalSnapshot();
  const { digest } = useEchoDigest(enabled);

  const preview = useMemo(() => {
    const epicon = snapshot?.epicon?.data as { items?: Array<Record<string, unknown>> } | undefined;
    const items = Array.isArray(epicon?.items) ? epicon.items : [];
    const fallbackRows = Math.max(digest?.ledger_preview.pending ?? 0, items.length, 1);
    const events: LedgerEntry[] = items.slice(0, 20).map((item, idx) => ({
      id: typeof item.id === 'string' ? item.id : `snapshot-${idx}`,
      cycleId: digest?.cycle ?? snapshot?.cycle ?? 'C-—',
      type: 'epicon',
      agentOrigin: typeof item.agentOrigin === 'string' ? item.agentOrigin : 'ECHO',
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : (digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString()),
      title: typeof item.title === 'string' ? item.title : undefined,
      summary: typeof item.summary === 'string' ? item.summary : 'Digest preview event',
      integrityDelta: 0,
      status: 'pending',
      category: undefined,
      confidenceTier: typeof item.confidenceTier === 'number' ? item.confidenceTier : undefined,
      source: 'echo',
    }));

    if (events.length === 0) {
      for (let i = 0; i < fallbackRows; i += 1) {
        events.push({
          id: `digest-${i}`,
          cycleId: digest?.cycle ?? 'C-—',
          type: 'epicon',
          agentOrigin: 'ECHO',
          timestamp: digest?.timestamp ?? new Date().toISOString(),
          summary: 'Digest preview row',
          integrityDelta: 0,
          status: 'pending',
          source: 'echo',
        });
      }
    }

    return {
      ok: true,
      events,
      candidates: {
        pending: digest?.ledger_preview.pending ?? events.length,
        confirmed: digest?.ledger_preview.promoted ?? 0,
        contested: digest?.ledger_preview.contested ?? 0,
      },
      fallback: true,
      timestamp: digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString(),
    } satisfies LedgerChamberPayload;
  }, [digest, snapshot]);

  return useChamberHydration<LedgerChamberPayload>('/api/chambers/ledger', enabled, { previewData: preview });
}
