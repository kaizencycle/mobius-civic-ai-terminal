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

type RawSignal = { agentName: string; value: number; source: string; label: string; severity: string };
type RawSnapshotSignals = { allSignals?: RawSignal[]; composite?: number; timestamp?: string };

export function useSignalsChamber(enabled: boolean) {
  const { snapshot } = useTerminalSnapshot();
  const { digest } = useEchoDigest(enabled);

  const preview = useMemo(() => {
    const raw = snapshot?.signals?.data;
    const instrumentCount = digest?.signals_preview.instrument_count ?? 0;
    const anomalyCount = digest?.signals_preview.anomalies ?? 0;
    const topAgents = digest?.signals_preview.top_agents ?? [];

    // C-290: snapshot signals payload is { allSignals, composite, ... }, not
    // { families, anomalies, ... }. Build families and anomalies from allSignals
    // so the SIG chamber renders agent groupings on first paint instead of a
    // single empty DIGEST stub.
    const rawSignals = raw as RawSnapshotSignals | null;
    const allSignals = rawSignals?.allSignals;

    const snapshotFamilies: Array<{ name: string; healthy: boolean; count: number }> | null = allSignals
      ? Object.entries(
          allSignals.reduce<Record<string, RawSignal[]>>((acc, s) => {
            const family = s.agentName.split('-')[0]?.toUpperCase() ?? 'UNKNOWN';
            (acc[family] ??= []).push(s);
            return acc;
          }, {}),
        ).map(([name, sigs]) => ({
          name,
          healthy: sigs.every((s) => s.value > 0),
          count: sigs.length,
        }))
      : null;

    const snapshotAnomalies: SignalsChamberPayload['anomalies'] | null = allSignals
      ? allSignals
          .filter((s) => s.severity === 'critical' || s.severity === 'watch')
          .map((s) => ({
            agentName: s.agentName,
            source: s.source,
            severity: s.severity,
            label: s.label,
          }))
      : null;

    const builtPayload: SignalsChamberPayload = {
      ok: true,
      fallback: true,
      families: snapshotFamilies ?? [
        { name: 'DIGEST', healthy: !digest?.degraded, count: instrumentCount },
      ],
      anomalies: snapshotAnomalies ?? Array.from({ length: anomalyCount }, (_, idx) => ({
        agentName: topAgents[idx] ?? 'ECHO',
        source: 'echo-digest',
        severity: 'watch',
        label: 'Digest preview anomaly',
      })),
      composite: rawSignals?.composite ?? digest?.integrity.gi ?? null,
      last_sweep: rawSignals?.timestamp ?? digest?.timestamp ?? null,
      raw: raw ?? { source: 'echo-digest', instrumentCount, anomalies: anomalyCount, topAgents },
      timestamp: rawSignals?.timestamp ?? digest?.timestamp ?? new Date().toISOString(),
    };

    if (!raw || typeof raw !== 'object') return builtPayload;
    const asPayload = raw as Partial<SignalsChamberPayload>;
    return {
      ...builtPayload,
      // Guard against the /api/chambers/signals catch path returning
      // families: [] which would wipe out the families built from allSignals.
      families: Array.isArray(asPayload.families) && asPayload.families.length > 0
        ? asPayload.families
        : builtPayload.families,
      anomalies: Array.isArray(asPayload.anomalies) ? asPayload.anomalies : builtPayload.anomalies,
      composite: typeof asPayload.composite === 'number' ? asPayload.composite : builtPayload.composite,
      last_sweep: typeof asPayload.timestamp === 'string' ? asPayload.timestamp : builtPayload.last_sweep,
      raw,
      timestamp: typeof asPayload.timestamp === 'string' ? asPayload.timestamp : builtPayload.timestamp,
    } satisfies SignalsChamberPayload;
  }, [snapshot, digest]);

  return useChamberHydration<SignalsChamberPayload>('/api/chambers/signals', enabled, { previewData: preview });
}
