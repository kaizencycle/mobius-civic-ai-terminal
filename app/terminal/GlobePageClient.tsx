'use client';

import { useMemo } from 'react';
import GlobeChamber from '@/components/terminal/chambers/GlobeChamber';
import GlobeView3D from '@/components/terminal/chambers/GlobeView3D';
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
  const { data, loading, preview, full, error, stabilizationActive } = useGlobeChamber(true);
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
  const liveFeed = echoEpicon.slice(0, 4);
  const microSignalsCount = Array.isArray(micro?.allSignals) ? micro.allSignals.length : 0;
  const tripwireCount = Array.isArray(micro?.anomalies) ? micro.anomalies.length : 0;
  const verifiedCount = echoEpicon.filter((item) => item.status === 'verified').length;
  const clock = `${new Date().toISOString().slice(11, 19)} UTC`;

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
      {stabilizationActive ? (
        <div className="mx-4 mt-2 rounded border border-amber-700/50 bg-amber-950/30 px-3 py-1 text-[10px] text-amber-100">
          ⚠ Predictive Stabilization Active · Preview state prioritized due to integrity drift
        </div>
      ) : null}
      <div className="hidden h-[calc(100%-0px)] overflow-hidden border-y border-white/[0.06] bg-[radial-gradient(ellipse_at_top,_#0a1628_0%,_#050810_50%,_#02040a_100%)] text-[#e9e6df] md:flex md:flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="font-semibold tracking-tight text-[#fafaf7]">Möbius</div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-slate-400">CIVIC TERMINAL · {cycle}</div>
          </div>
          <div className="flex gap-4 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            {['World', 'Pulse', 'Signals', 'Sentinel', 'Ledger', 'Tripwire', 'MIC'].map((tab) => (
              <span key={tab} className={tab === 'World' ? 'border-b border-cyan-300 pb-1 text-cyan-200' : ''}>
                {tab}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
            {clock}
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[1.2fr_1fr]">
          <div className="relative overflow-hidden border-r border-white/[0.06]">
            <GlobeView3D
              micro={micro}
              echoEpicon={echoEpicon}
              domains={domains}
              cycleId={cycle}
              clockLabel={clock}
              giScore={gi}
              miiScore={miiScore}
            />
            <div className="absolute bottom-5 left-5 max-w-md rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 backdrop-blur-sm">
              <div className="font-mono text-[10px] tracking-[0.2em] text-slate-400">WORLD STATE</div>
              <div className="mt-1 text-xl leading-tight text-[#fafaf7]">
                Eight agents, watching {microSignalsCount} signals across live lanes.
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-6 overflow-y-auto p-8">
            <div>
              <div className="font-mono text-[10px] tracking-[0.22em] text-slate-400">GLOBAL INTEGRITY</div>
              <div className="mt-2 text-7xl font-extralight leading-none tracking-[-0.04em] text-[#fafaf7]">{gi.toFixed(3)}</div>
              <div className="mt-2 font-mono text-[10px] text-slate-400">Live chamber composite · source: snapshot + globe chamber</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="font-mono text-[9px] tracking-[0.18em] text-slate-500">SIGNALS</div>
                <div className="text-2xl text-[#fafaf7]">{microSignalsCount}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-[0.18em] text-slate-500">TRIPWIRES</div>
                <div className="text-2xl text-[#fafaf7]">{tripwireCount}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-[0.18em] text-slate-500">VERIFIED</div>
                <div className="text-2xl text-[#fafaf7]">{verifiedCount}</div>
              </div>
            </div>
            <div>
              <div className="border-b border-white/[0.08] pb-2 font-mono text-[10px] tracking-[0.2em] text-slate-400">LIVE FEED</div>
              <div className="mt-3 space-y-2">
                {liveFeed.length ? (
                  liveFeed.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-slate-100">{item.title}</div>
                        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
                          {item.ownerAgent} · {item.category}
                        </div>
                      </div>
                      <div className="font-mono text-[10px] text-emerald-300">T{item.confidenceTier}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500">No live feed entries available for this cycle.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="md:hidden">
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
    </div>
  );
}
