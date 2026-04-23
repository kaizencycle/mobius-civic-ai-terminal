'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useEchoDigest } from '@/hooks/useEchoDigest';
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
  const { digest } = useEchoDigest(enabled);

  const preview = useMemo(() => {
    const raw = snapshot?.signals?.data;
    const instrumentCount = digest?.signals_preview.instrument_count ?? 0;
    const anomalies = digest?.signals_preview.anomalies ?? 0;
    const topAgents = digest?.signals_preview.top_agents ?? [];
    const digestPayload: SignalsChamberPayload = {
      ok: true,
      fallback: true,
      families: [
        {
          name: 'DIGEST',
          healthy: !digest?.degraded,
          count: instrumentCount,
        },
      ],
      anomalies: Array.from({ length: anomalies }, (_, idx) => ({
        agentName: topAgents[idx] ?? 'ECHO',
        source: 'echo-digest',
        severity: 'watch',
        label: 'Digest preview anomaly',
      })),
      composite: digest?.integrity.gi ?? null,
      last_sweep: digest?.timestamp ?? null,
      raw: {
        source: 'echo-digest',
        instrumentCount,
        anomalies,
        topAgents,
      },
      timestamp: digest?.timestamp ?? new Date().toISOString(),
    };

    if (!raw || typeof raw !== 'object') return digestPayload;
    const asPayload = raw as Partial<SignalsChamberPayload>;
    return {
      ...digestPayload,
      families: Array.isArray(asPayload.families) ? asPayload.families : digestPayload.families,
      anomalies: Array.isArray(asPayload.anomalies) ? asPayload.anomalies : digestPayload.anomalies,
      composite: typeof asPayload.composite === 'number' ? asPayload.composite : digestPayload.composite,
      last_sweep: typeof asPayload.timestamp === 'string' ? asPayload.timestamp : digestPayload.last_sweep,
      raw,
      timestamp: typeof asPayload.timestamp === 'string' ? asPayload.timestamp : digestPayload.timestamp,
    } satisfies SignalsChamberPayload;
  }, [snapshot, digest]);

  return useChamberHydration<SignalsChamberPayload>('/api/chambers/signals', enabled, { previewData: preview });
}
