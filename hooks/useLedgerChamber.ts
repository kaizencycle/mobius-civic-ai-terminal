'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
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
  const preview = useMemo(() => {
    const epicon = snapshot?.epicon?.data as { items?: Array<Record<string, unknown>> } | undefined;
    const items = Array.isArray(epicon?.items) ? epicon.items : [];
    const events: LedgerEntry[] = items.slice(0, 20).map((item, idx) => ({
      id: typeof item.id === 'string' ? item.id : `snapshot-${idx}`,
      cycleId: snapshot?.cycle ?? 'C-—',
      type: 'epicon',
      agentOrigin: typeof item.agentOrigin === 'string' ? item.agentOrigin : 'ECHO',
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : (snapshot?.timestamp ?? new Date().toISOString()),
      title: typeof item.title === 'string' ? item.title : undefined,
      summary: typeof item.summary === 'string' ? item.summary : 'Snapshot preview event',
      integrityDelta: 0,
      status: 'pending',
      category: undefined,
      confidenceTier: typeof item.confidenceTier === 'number' ? item.confidenceTier : undefined,
      source: 'echo',
    }));

    return {
      ok: true,
      events,
      candidates: { pending: events.length, confirmed: 0, contested: 0 },
      fallback: true,
      timestamp: snapshot?.timestamp ?? new Date().toISOString(),
    } satisfies LedgerChamberPayload;
  }, [snapshot]);

  return useChamberHydration<LedgerChamberPayload>('/api/chambers/ledger', enabled, { previewData: preview });
}
