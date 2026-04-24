'use client';

import { useMemo } from 'react';
import GlobeChamber from '@/components/terminal/chambers/GlobeChamber';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { buildEveEscalationStrip } from '@/components/terminal/chambers/globeDashboardExtras';
import type { SentimentDomain } from '@/components/terminal/chambers/types';
import { useGlobeChamber } from '@/hooks/useGlobeChamber';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import type { MicroAgentSweepResult } from '@/lib/agents/micro';
import type { EpiconItem } from '@/lib/terminal/types';

type RawSentimentDomain = {
  key: string;
  label: string;
  agent: string;
  score: number | null;
  sourceLabel?: string;
};

type SentimentPayload = {
  domains?: RawSentimentDomain[];
  overall_sentiment?: number | null;
  gi?: number;
};

function toStatus(score: number | null): SentimentDomain['status'] {
  if (score === null) return 'unknown';
  if (score >= 0.8) return 'nominal';
  if (score >= 0.6) return 'stressed';
  return 'critical';
}

export default function GlobePageClient() {
  const { data, loading, preview, full, error } = useGlobeChamber(true);
  // C-290: the globe chamber API returns sentiment: null (it only runs the
  // micro sweep). Pull sentiment from the snapshot so domain rings populate.
  const { snapshot } = useTerminalSnapshot();

  const micro = (data?.micro && typeof data.micro === 'object' ? data.micro : null) as MicroAgentSweepResult | null;
  const echo = (data?.echo && typeof data.echo === 'object' ? data.echo : {}) as { epicon?: EpiconItem[] };
  const echoEpicon = echo.epicon ?? [];
  const cycle = data?.cycle ?? preview?.cycle ?? 'C-—';

  // Prefer live sentiment from the chamber response, fall back to snapshot
  const chamberSentiment = (data?.sentiment && typeof data.sentiment === 'object')
    ? (data.sentiment as SentimentPayload)
    : null;
  const snapshotSentiment = (snapshot?.sentiment?.data && typeof snapshot.sentiment.data === 'object')
    ? (snapshot.sentiment.data as SentimentPayload)
    : null;
  const sentimentSource = chamberSentiment ?? snapshotSentiment;

  // Map raw domains (which have sourceLabel) to the GlobeChamber-canonical
  // shape (which requires status derived from score).
  const domains: SentimentDomain[] = (sentimentSource?.domains ?? []).map((d) => ({
    key: d.key as SentimentDomain['key'],
    label: d.label,
    agent: d.agent,
    score: d.score,
    status: toStatus(d.score),
  }));

  // GI: prefer chamber data, then snapshot
  const gi = typeof data?.gi === 'number' && data.gi > 0
    ? data.gi
    : typeof preview?.gi === 'number'
      ? preview.gi
      : typeof snapshot?.gi === 'number'
        ? snapshot.gi
        : 0;

  const miiScore = snapshotSentiment?.overall_sentiment ?? null;

  const globeDashboard = useMemo(() => {
    if (!data && !snapshot) return null;
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
  }, [data, snapshot, echoEpicon, loading]);

  if (loading && !data && !snapshot) return <ChamberSkeleton blocks={4} />;

  return (
    <div className="h-full">
      {preview && !full ? (
        <div className="mx-4 mt-3 rounded border border-cyan-800/40 bg-cyan-950/20 px-3 py-1 text-[10px] text-cyan-200">
          Globe preview from snapshot · enriching in background
        </div>
      ) : null}
      {error ? (
        <div className="mx-4 mt-2 rounded border border-amber-800/40 bg-amber-950/20 px-3 py-1 text-[10px] text-amber-200">
          Globe chamber degraded · showing preview state
        </div>
      ) : null}
      <GlobeChamber
        micro={micro}
        echoEpicon={echoEpicon}
        domains={domains}
        cycleId={cycle}
        clockLabel={`${new Date().toISOString().slice(11, 16)} UTC`}
        giScore={gi}
        miiScore={miiScore}
        globeDashboard={globeDashboard}
      />
    </div>
  );
}
