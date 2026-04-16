'use client';

import GlobeChamber from '@/components/terminal/chambers/GlobeChamber';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
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

  return (
    <GlobeChamber
      micro={micro}
      echoEpicon={echoEpicon}
      domains={domains}
      cycleId={cycle}
      clockLabel={`${new Date().toISOString().slice(11, 16)} UTC`}
      giScore={Number(gi)}
      miiScore={null}
    />
  );
}
