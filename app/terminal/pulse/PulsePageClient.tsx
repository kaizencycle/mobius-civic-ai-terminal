'use client';

import { useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

const AGENT_FILTERS = ['ALL', 'ATLAS', 'ZEUS', 'EVE', 'HERMES', 'AUREA', 'JADE', 'DAEDALUS', 'ECHO'] as const;

type PulseItem = {
  id: string;
  agent?: string;
  title?: string;
  timestamp?: string;
  severity?: string;
  type?: string;
  category?: string;
  tags?: string[];
  mii_score?: number;
  source?: string;
  status?: string;
  cycle?: string;
  gi?: number | null;
};

const EVENT_TYPES = ['HEARTBEAT', 'WATCH', 'CATALOG', 'EPICON', 'JOURNAL', 'VERIFY', 'ROUTING', 'PROMOTION', 'SIGNAL'] as const;
type JournalEntry = {
  id: string;
  agent: string;
  timestamp: string;
  observation: string;
  inference: string;
  recommendation: string;
  severity?: string;
  confidence?: number;
  cycle?: string;
};

type LaneState = {
  key: string;
  state: 'healthy' | 'degraded' | 'offline' | 'stale' | 'empty';
};

function mapEventType(item: PulseItem): (typeof EVENT_TYPES)[number] | 'OTHER' {
  const raw = [item.type, item.category, item.title, ...(item.tags ?? [])]
    .filter((v): v is string => Boolean(v))
    .join(' ')
    .toLowerCase();
  if (raw.includes('heartbeat')) return 'HEARTBEAT';
  if (raw.includes('watch') || raw.includes('tripwire')) return 'WATCH';
  if (raw.includes('catalog')) return 'CATALOG';
  if (raw.includes('journal')) return 'JOURNAL';
  if (raw.includes('verify') || raw.includes('verification') || raw.includes('zeus')) return 'VERIFY';
  if (raw.includes('routing') || raw.includes('route')) return 'ROUTING';
  if (raw.includes('promotion') || raw.includes('promoted') || raw.includes('promoter')) return 'PROMOTION';
  if (raw.includes('signal') || raw.includes('integrity')) return 'SIGNAL';
  if (raw.includes('epicon') || item.id.startsWith('epi_') || item.id.startsWith('epicon')) return 'EPICON';
  return 'OTHER';
}

function parseCycleNumber(cycle: string | null): number | null {
  if (!cycle) return null;
  const match = /^C-(\d+)$/i.exec(cycle.trim());
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function fmtCycle(num: number | null): string | null {
  if (num == null || Number.isNaN(num) || num <= 0) return null;
  return `C-${String(num).padStart(3, '0')}`;
}

function relTime(ts?: string): string {
  if (!ts) return 'unknown freshness';
  const ms = new Date(ts).getTime();
  if (!Number.isFinite(ms)) return 'unknown freshness';
  const deltaMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (deltaMin < 1) return 'just now';
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const h = Math.floor(deltaMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PulsePageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [selected, setSelected] = useState<(typeof AGENT_FILTERS)[number]>('ALL');

  const items = useMemo(
    () => ((snapshot?.epicon?.data ?? {}) as { items?: PulseItem[] }).items ?? [],
    [snapshot],
  );
  const filtered = useMemo(
    () => (selected === 'ALL' ? items : items.filter((item) => (item.agent ?? '').toUpperCase() === selected)),
    [items, selected],
  );
  const journalEntries = useMemo(
    () => ((snapshot?.journal?.data ?? {}) as { entries?: JournalEntry[] }).entries ?? [],
    [snapshot],
  );
  const latestSynthesis = journalEntries[0] ?? null;
  const eveCycle = useMemo(() => {
    const eve = (snapshot?.eve?.data ?? {}) as { currentCycle?: string; cycleId?: string };
    return eve.currentCycle ?? eve.cycleId ?? null;
  }, [snapshot]);
  const prevCycle = useMemo(() => {
    const n = parseCycleNumber(eveCycle);
    return fmtCycle(n != null ? n - 1 : null);
  }, [eveCycle]);
  const currentGi = ((snapshot?.epicon?.data ?? {}) as { summary?: { latestGI?: number | null } }).summary?.latestGI ?? null;
  const prevGi = useMemo(
    () =>
      items
        .filter((item) => item.cycle && item.cycle === prevCycle && typeof item.gi === 'number')
        .map((item) => item.gi as number)[0] ?? null,
    [items, prevCycle],
  );
  const giDelta = currentGi != null && prevGi != null ? currentGi - prevGi : null;
  const newEpiconCount = useMemo(
    () => (prevCycle ? items.filter((item) => item.cycle === eveCycle).length : items.length),
    [items, eveCycle, prevCycle],
  );
  const newJournalCount = useMemo(
    () => (prevCycle ? journalEntries.filter((entry) => entry.cycle === eveCycle).length : journalEntries.length),
    [journalEntries, eveCycle, prevCycle],
  );
  const degradedLaneCount = useMemo(() => {
    const lanes = ((snapshot as { lanes?: LaneState[] } | null)?.lanes ?? []) as LaneState[];
    return lanes.filter((lane) => lane.state === 'degraded' || lane.state === 'offline').length;
  }, [snapshot]);
  const promotionCounters = ((snapshot?.promotion?.data ?? {}) as { counters?: { pending_promotable_count?: number; promoted_this_cycle_count?: number } }).counters;
  const epiconSources = ((snapshot?.epicon?.data ?? {}) as {
    sources?: { github?: number; kv?: number; ledgerApi?: number; memory?: number; memoryLedger?: number };
  }).sources;
  const journalSources = ((snapshot?.journal?.data ?? {}) as { sources?: { kv?: number; substrate?: number } }).sources;

  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Pulse Ledger</h1>
        <div className="text-xs text-slate-400">{filtered.length} entries</div>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {AGENT_FILTERS.map((name) => (
          <button key={name} onClick={() => setSelected(name)} className={`rounded border px-2 py-1 text-[11px] font-mono ${selected === name ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-100' : 'border-slate-700 text-slate-400'}`}>
            {name}
          </button>
        ))}
      </div>
      <section className="mb-3 rounded border border-slate-800 bg-slate-900/60 p-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">DELTA</div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">EPICON +{newEpiconCount}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">JOURNAL +{newJournalCount}</span>
          <span className="rounded border border-amber-700/70 px-1.5 py-0.5 text-amber-200">degraded lanes {degradedLaneCount}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">
            GI Δ {giDelta == null ? '—' : `${giDelta >= 0 ? '+' : ''}${giDelta.toFixed(2)}`}
          </span>
          {promotionCounters && (
            <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">
              promotions {promotionCounters.pending_promotable_count ?? 0} pending · {promotionCounters.promoted_this_cycle_count ?? 0} promoted
            </span>
          )}
        </div>
      </section>
      <section className="mb-3 rounded border border-cyan-700/40 bg-cyan-950/20 p-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">LATEST SYNTHESIS</div>
        {latestSynthesis ? (
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="rounded border border-cyan-600/50 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-100">{latestSynthesis.agent}</span>
              <span className="text-slate-400">{latestSynthesis.timestamp}</span>
              <span className="text-slate-500">{relTime(latestSynthesis.timestamp)}</span>
              <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300">sev {latestSynthesis.severity ?? 'nominal'}</span>
              {typeof latestSynthesis.confidence === 'number' && (
                <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300">
                  conf {(latestSynthesis.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-[11px] leading-snug text-slate-200"><span className="text-slate-400">Obs:</span> {latestSynthesis.observation}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-200"><span className="text-slate-400">Inf:</span> {latestSynthesis.inference}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-200"><span className="text-slate-400">Rec:</span> {latestSynthesis.recommendation}</p>
          </div>
        ) : (
          <div className="text-xs text-slate-400">No journal synthesis available yet in this cycle.</div>
        )}
      </section>
      <section className="mb-4 rounded border border-slate-800 bg-slate-900/60 p-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">SOURCES</div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-200">
          <span className="rounded border border-slate-700 px-1.5 py-0.5">GitHub {epiconSources?.github ?? 0}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5">KV {epiconSources?.kv ?? 0}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5">Journal {journalEntries.length}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5">Ledger API {epiconSources?.ledgerApi ?? 0}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5">Memory {((epiconSources?.memory ?? 0) + (epiconSources?.memoryLedger ?? 0))}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5">Journal KV {journalSources?.kv ?? 0}</span>
        </div>
      </section>
      <div className="space-y-2">
        {filtered.map((item) => (
          <article key={item.id} className="rounded border border-slate-800 bg-slate-900/60 p-2.5 md:p-3">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
              <span className="rounded border border-cyan-600/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-100">
                {mapEventType(item)}
              </span>
              <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-slate-400">{item.agent ?? 'SYSTEM'}</span>
              <span className="text-slate-500">{item.status ?? 'active'}</span>
            </div>
            <div className="text-sm font-semibold leading-snug text-slate-100">
              {item.title ?? 'Untitled EPICON event'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span>{item.timestamp ?? '—'}</span>
              <span>sev {item.severity ?? 'unknown'}</span>
              <span>MII {item.mii_score ?? '—'}</span>
            </div>
            <details className="mt-1.5 text-[10px] text-slate-500">
              <summary className="cursor-pointer list-none text-slate-500 underline decoration-dotted underline-offset-2">
                More details
              </summary>
              <div className="mt-1">source {item.source ?? '—'} · id {item.id}</div>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
