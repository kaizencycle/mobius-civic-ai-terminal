'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export type SignalsChamberPayload = {
  ok: boolean;
  fallback: boolean;
  families: Array<{ name: string; healthy: boolean; count: number }>;
  anomalies: Array<{ agentName: string; source: string; severity: string; label: string }>;
  composite: number | null;
  last_sweep: string | null;
  raw: unknown;
  timestamp: string;
};

export function useSignalsChamber(enabled: boolean) {
  const { snapshot } = useTerminalSnapshot();
  const preview = useMemo(() => {
    const raw = snapshot?.signals?.data;
    if (!raw || typeof raw !== 'object') return null;
    const asPayload = raw as Partial<SignalsChamberPayload>;
    return {
      ok: true,
      fallback: true,
      families: Array.isArray(asPayload.families) ? asPayload.families : [],
      anomalies: Array.isArray(asPayload.anomalies) ? asPayload.anomalies : [],
      composite: typeof asPayload.composite === 'number' ? asPayload.composite : null,
      last_sweep: typeof asPayload.timestamp === 'string' ? asPayload.timestamp : null,
      raw,
      timestamp: typeof asPayload.timestamp === 'string' ? asPayload.timestamp : (snapshot?.timestamp ?? new Date().toISOString()),
    } satisfies SignalsChamberPayload;
  }, [snapshot]);

  return useChamberHydration<SignalsChamberPayload>('/api/chambers/signals', enabled, { previewData: preview });
}
