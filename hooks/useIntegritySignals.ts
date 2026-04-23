'use client';

import { useCallback, useEffect, useState } from 'react';
import { MobiusDataClient, type SseConnectionStatus, type SseStatusDetail } from '@/lib/ingestion/MobiusDataClient';
import type { IngestedSignal } from '@/lib/ingestion/types';

const MAX_SIGNAL_HISTORY = Number(process.env.NEXT_PUBLIC_MAX_SIGNAL_HISTORY ?? 1000);

function calculateTrend(signals: IngestedSignal[]): 'up' | 'down' | 'flat' {
  if (signals.length < 2) return 'flat';

  const newest = signals[0]?.processed.giContribution ?? 0;
  const oldest = signals[signals.length - 1]?.processed.giContribution ?? newest;
  const delta = newest - oldest;

  if (delta > 0.02) return 'up';
  if (delta < -0.02) return 'down';

  return 'flat';
}

export function useIntegritySignals() {
  const [client] = useState(() => new MobiusDataClient());
  const [signals, setSignals] = useState<IngestedSignal[]>([]);
  const [signalCounts, setSignalCounts] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [sseBySource, setSseBySource] = useState<Record<string, SseConnectionStatus>>({});

  useEffect(() => {
    const handleSignal = (event: Event) => {
      const customEvent = event as CustomEvent<IngestedSignal>;
      const signal = customEvent.detail;

      setSignals((previous) => [signal, ...previous].slice(0, MAX_SIGNAL_HISTORY));
      setSignalCounts((previous) => ({
        ...previous,
        [signal.type]: (previous[signal.type] ?? 0) + 1,
        total: (previous.total ?? 0) + 1,
      }));
    };

    const handleSseStatus = (event: Event) => {
      const e = event as CustomEvent<SseStatusDetail>;
      const d = e.detail;
      if (!d?.source) return;
      setSseBySource((prev) => ({ ...prev, [d.source]: d.status }));
    };

    client.signalBus.addEventListener('signal', handleSignal);
    client.signalBus.addEventListener('sse:status', handleSseStatus);

    void client.connectAll().then(() => {
      setIsConnected(true);
    });

    return () => {
      client.signalBus.removeEventListener('signal', handleSignal);
      client.signalBus.removeEventListener('sse:status', handleSseStatus);
      client.disconnectAll();
    };
  }, [client]);

  const getSignalsByType = useCallback(
    (type: string) => signals.filter((signal) => signal.type === type),
    [signals],
  );

  const getLatestSignal = useCallback(
    (type?: string) => {
      if (!type) return signals[0];
      return signals.find((signal) => signal.type === type);
    },
    [signals],
  );

  const getAggregatedGI = useCallback(() => {
    const integritySignals = getSignalsByType('integrity');
    if (integritySignals.length === 0) return null;

    const latest = integritySignals[0].processed;

    return {
      current: latest.giContribution,
      factors: {
        sourceReliability: latest.sourceReliability,
        institutionalTrust: latest.institutionalTrust,
        consensusStability: latest.consensusStability,
        narrativeDivergence: latest.narrativeDivergence,
      },
      trend: calculateTrend(integritySignals.slice(0, 24)),
    };
  }, [getSignalsByType]);

  const streamHealth: 'live' | 'degraded' | 'unknown' = (() => {
    const statuses = Object.values(sseBySource);
    if (statuses.length === 0) return 'unknown';
    if (statuses.some((s) => s === 'circuit_open' || s === 'degraded')) return 'degraded';
    if (statuses.every((s) => s === 'live')) return 'live';
    return 'unknown';
  })();

  return {
    signals,
    signalCounts,
    isConnected,
    sseBySource,
    streamHealth,
    getSignalsByType,
    getLatestSignal,
    getAggregatedGI,
    client,
  };
}
