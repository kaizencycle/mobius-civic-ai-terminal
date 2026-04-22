'use client';

import { useMemo } from 'react';
import GlobeChamber from '@/components/terminal/chambers/GlobeChamber';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { buildEveEscalationStrip } from '@/components/terminal/chambers/globeDashboardExtras';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import type { MicroAgentSweepResult } from '@/lib/agents/micro';
import type { EpiconItem } from '@/lib/terminal/types';

export default function GlobePageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  if (loading && !snapshot) return <ChamberSkeleton blocks={4} />;

  const integrityData = snapshot?.integrity?.data;
  const integrity = (integrityData && typeof integrityData === 'object' ? integrityData : {}) as { cycle?: string; global_integrity?: number };

  const signalsData = snapshot?.signals?.data;
  const micro = (signalsData && typeof signalsData === 'object' && 'allSignals' in (signalsData as Record<string, unknown>))
    ? (signalsData as MicroAgentSweepResult)
    : null;

  const epiconData = snapshot?.epicon?.data;
  const epiconLane = (epiconData && typeof epiconData === 'object' ? epiconData : {}) as { items?: EpiconItem[] };
  const echoData = snapshot?.echo?.data;
  const echoLane = (echoData && typeof echoData === 'object' ? echoData : {}) as { epicon?: EpiconItem[] };
  const byId = new Map<string, EpiconItem>();
  for (const row of [...(echoLane.epicon ?? []), ...(epiconLane.items ?? [])]) {
    if (row?.id) byId.set(row.id, row);
  }
  const echoEpicon = [...byId.values()];

  const sentimentData = snapshot?.sentiment?.data;
  const sentiment = (sentimentData && typeof sentimentData === 'object' ? sentimentData : {}) as {
    domains?: Array<{ key: 'civic' | 'environ' | 'financial' | 'narrative' | 'infrastructure' | 'institutional'; label: string; agent: string; score: number | null }>;
  };

  const domains = (sentiment.domains ?? []).map((d) => ({
    ...d,
    status: (d.score === null ? 'unknown' : d.score >= 0.8 ? 'nominal' : d.score >= 0.65 ? 'stressed' : 'critical') as
      | 'nominal'
      | 'stressed'
      | 'critical'
      | 'unknown',
  }));

  const cycle = integrity.cycle ?? (snapshot as Record<string, unknown> | null)?.cycle as string | undefined ?? 'C-271';
  const gi = integrity.global_integrity ?? (snapshot as Record<string, unknown> | null)?.gi as number | undefined ?? 0;

  const laneAge = (leaf: unknown): number | null => {
    if (!leaf || typeof leaf !== 'object') return null;
    const row = leaf as Record<string, unknown>;
    if (typeof row.age_seconds === 'number') return row.age_seconds;
    if (typeof row.timestamp === 'string') {
      const ms = new Date(row.timestamp).getTime();
      if (Number.isFinite(ms)) return Math.max(0, Math.floor((Date.now() - ms) / 1000));
    }
    return null;
  };

  const globeDashboard = useMemo(() => {
    if (!snapshot) return null;
    const eveStrip = buildEveEscalationStrip(echoEpicon);
    const EXPECTED_SIGNAL_COUNT = 31;
    const signalCount = Array.isArray(micro?.allSignals) ? micro.allSignals.length : 0;
    const missing = Math.max(0, EXPECTED_SIGNAL_COUNT - signalCount);
    const signalWarnings = missing > 0
      ? [{ type: 'instrument_dropout' as const, count: missing, message: `${missing} instrument(s) absent from sweep` }]
      : [];
    const panelAgeSeconds = {
      sentiment: laneAge(snapshot.sentiment?.data),
      seismic: laneAge(snapshot.echo?.data),
      environmental: laneAge(snapshot.signals?.data),
      markets: laneAge(snapshot.signals?.data),
      mii: laneAge(snapshot.mii?.data),
      vault: laneAge(snapshot.vault?.data),
      infrastructure: laneAge(snapshot.runtime?.data),
    };
    return {
      eveStrip,
      snapshotLoaded: !loading,
      signalWarnings,
      panelAgeSeconds,
      echoEpicon,
      kvHealth: snapshot.kvHealth?.data ?? null,
      runtime: snapshot.runtime?.data ?? null,
      tripwire: snapshot.tripwire?.data ?? null,
      vault: snapshot.vault?.data ?? null,
      micReadiness: snapshot.micReadiness?.data ?? null,
      miiFeed: snapshot.mii?.data ?? null,
    };
  }, [snapshot, echoEpicon, loading, micro]);

  return (
    <GlobeChamber
      micro={micro}
      echoEpicon={echoEpicon}
      domains={domains}
      cycleId={cycle}
      clockLabel={`${new Date().toISOString().slice(11, 16)} UTC`}
      giScore={Number(gi)}
      miiScore={null}
      globeDashboard={globeDashboard}
    />
  );
}
