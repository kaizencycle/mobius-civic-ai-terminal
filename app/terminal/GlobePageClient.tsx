'use client';

import { useMemo } from 'react';
import GlobeChamber from '@/components/terminal/chambers/GlobeChamber';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { buildEveEscalationStrip } from '@/components/terminal/chambers/globeDashboardExtras';
import { useGlobeChamber } from '@/hooks/useGlobeChamber';
import type { MicroAgentSweepResult } from '@/lib/agents/micro';
import type { EpiconItem } from '@/lib/terminal/types';

export default function GlobePageClient() {
  const { data, loading } = useGlobeChamber(true);

  const micro = (data?.micro && typeof data.micro === 'object' ? data.micro : null) as MicroAgentSweepResult | null;
  const echo = (data?.echo && typeof data.echo === 'object' ? data.echo : {}) as { epicon?: EpiconItem[] };
  const echoEpicon = echo.epicon ?? [];
  const cycle = data?.cycle ?? 'C-271';
  const gi = 0;

  const globeDashboard = useMemo(() => {
    if (!data) return null;
    const eveStrip = buildEveEscalationStrip(echoEpicon);
    return {
      eveStrip,
      snapshotLoaded: !loading,
      signalWarnings: [],
      panelAgeSeconds: {},
      echoEpicon,
      kvHealth: null,
      runtime: null,
      tripwire: null,
      vault: null,
      micReadiness: null,
      miiFeed: null,
    };
  }, [data, echoEpicon, loading]);

  if (loading && !data) return <ChamberSkeleton blocks={4} />;

  return (
    <GlobeChamber
      micro={micro}
      echoEpicon={echoEpicon}
      domains={[]}
      cycleId={cycle}
      clockLabel={`${new Date().toISOString().slice(11, 16)} UTC`}
      giScore={Number(gi)}
      miiScore={null}
      globeDashboard={globeDashboard}
    />
  );
}
