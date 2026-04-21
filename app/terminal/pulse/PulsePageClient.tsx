'use client';

import { useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import type { SnapshotLaneState } from '@/hooks/useTerminalSnapshot';
import { provenanceDescription, provenanceShortLabel } from '@/lib/terminal/memoryMode';

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

type LaneState = SnapshotLaneState;

type IntegrityData = {
  global_integrity?: number;
  mode?: string;
  source?: string;
  degraded?: boolean;
  terminal_status?: string;
  timestamp?: string;
};

type VaultData = {
  balance_reserve?: number;
  status?: string;
};

function mapEventType(item: PulseItem): (typeof EVENT_TYPES)[number] | 'OTHER' {
  const cat = (item.category ?? '').toLowerCase();
  if (cat === 'market') return 'SIGNAL';
  if (cat === 'infrastructure') return 'SIGNAL';
  if (cat === 'governance' || cat === 'civic-risk') return 'WATCH';
  if (cat === 'geopolitical') return 'WATCH';
  if (cat === 'narrative') return 'ROUTING';

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
  if (!ts) return 'unknown';
  const ms = new Date(ts).getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  const deltaMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (deltaMin < 1) return 'just now';
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const h = Math.floor(deltaMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Human-readable data freshness for synthesis / operator trust (C-285 legibility). */
function synthesisFreshness(ts?: string): { tier: 'live' | 'fresh' | 'delayed' | 'stale' | 'unknown'; line: string } {
  if (!ts) {
    return { tier: 'unknown', line: 'No synthesis timestamp — treat governance text as unverified for recency.' };
  }
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return { tier: 'unknown', line: 'Timestamp not parseable.' };
  }
  const min = ms / 60000;
  if (min < 5) {
    return { tier: 'live', line: 'Synthesis is live: updated within the last few minutes.' };
  }
  if (min < 30) {
    return { tier: 'fresh', line: 'Synthesis is fresh: still within a normal operator sweep window.' };
  }
  if (min < 120) {
    return { tier: 'delayed', line: 'Delayed: journal synthesis is older than usual — confirm nothing is stuck upstream.' };
  }
  return { tier: 'stale', line: 'Stale: synthesis may not reflect the current cycle — prefer live lanes before acting.' };
}

type ResolvedPulseState = {
  gi: number | null;
  posture: 'NOMINAL' | 'WATCH' | 'DEGRADED' | 'STALE' | 'UNRESOLVED';
  severity: string;
  cycle: string;
  freshness: string;
  tripwireActive: boolean;
  treasuryAvailable: boolean;
  treasuryStatus: string;
  vaultBalance: number | null;
  source: string;
};

function whyThisMatters(state: ResolvedPulseState, degradedLanes: number): string {
  if (state.posture === 'DEGRADED' || state.tripwireActive) {
    return 'Why this matters: elevated civic or integrity signals mean broad promotion and unattended automation carry higher reputational and audit risk until review catches up.';
  }
  if (state.posture === 'WATCH') {
    return 'Why this matters: the system is under watch — meaning is still reliable, but operator judgment should gate irreversible actions.';
  }
  if (degradedLanes >= 2) {
    return 'Why this matters: multiple degraded lanes reduce confidence that the snapshot is complete — verify critical paths before external commitments.';
  }
  return 'Why this matters: legible state helps policy, compliance, and operators align on the same risk picture without surveillance of individuals.';
}

function systemStory(state: ResolvedPulseState, degradedLanes: number, giDelta: number | null): string {
  const gi = state.gi != null ? `GI ${state.gi.toFixed(2)}` : 'GI unknown';
  const tw = state.tripwireActive ? 'Tripwire context active.' : 'No active tripwire tag on latest synthesis.';
  const lanes = degradedLanes > 0 ? `${degradedLanes} lane(s) degraded/offline.` : 'Core lanes nominal.';
  const delta =
    giDelta != null
      ? giDelta < 0
        ? `GI slipped ${Math.abs(giDelta).toFixed(2)} vs prior cycle snapshot.`
        : `GI held or improved vs prior cycle snapshot.`
      : '';
  const response =
    state.posture === 'DEGRADED' || state.tripwireActive
      ? 'Sentinels should bias to verification and tighter promotion gates.'
      : state.posture === 'WATCH'
        ? 'Sentinels are tightening review; continue monitoring before broad promotion.'
        : 'Continue normal operator cadence.';
  return `${state.cycle}: ${gi}. ${tw} ${lanes} ${delta} ${response}`.replace(/\s+/g, ' ').trim();
}

function suggestedActions(state: ResolvedPulseState): string[] {
  const out: string[] = ['Continue monitoring'];
  if (state.posture === 'DEGRADED' || state.tripwireActive) {
    out.unshift('Hold broad promotion until GI and tripwire posture improve');
    out.push('Escalate contested EPICONs for explicit ATLAS review');
  } else if (state.posture === 'WATCH') {
    out.unshift('Prefer watch-only on automated promotion paths');
  }
  if (state.gi != null && state.gi < 0.85) {
    out.push('Tighten promotion gates until GI stabilizes');
  }
  return [...new Set(out)];
}

function resolvePosture(
  lanes: LaneState[],
  integrity: IntegrityData | null,
  latestSynthesis: JournalEntry | null,
  tripwireElevated: boolean,
): ResolvedPulseState['posture'] {
  const sevText = (latestSynthesis?.severity ?? '').toLowerCase();
  const synthTags = ((latestSynthesis as unknown as { tags?: string[] })?.tags ?? []).join(' ').toLowerCase();

  if (tripwireElevated || sevText === 'critical' || synthTags.includes('tripwire')) return 'WATCH';
  if (sevText === 'elevated' || synthTags.includes('civic-risk') || synthTags.includes('integrity-stress')) return 'WATCH';
  if (integrity?.degraded) return 'DEGRADED';

  const degradedLanes = lanes.filter((l) => l.state === 'degraded' || l.state === 'offline');
  if (degradedLanes.length >= 3) return 'DEGRADED';
  if (degradedLanes.length >= 1) return 'WATCH';

  const staleLanes = lanes.filter((l) => l.state === 'stale');
  if (staleLanes.length >= 2) return 'STALE';

  return 'NOMINAL';
}

function postureStyle(posture: ResolvedPulseState['posture']) {
  switch (posture) {
    case 'NOMINAL': return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200';
    case 'WATCH': return 'border-amber-500/50 bg-amber-500/10 text-amber-200';
    case 'DEGRADED': return 'border-rose-500/50 bg-rose-500/10 text-rose-200';
    case 'STALE': return 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200';
    default: return 'border-slate-600 bg-slate-800/60 text-slate-300';
  }
}

function sevStyle(sev: string) {
  const s = sev.toLowerCase();
  if (s === 'critical') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (s === 'elevated') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-slate-700 text-slate-300';
}

function formatConfidence(conf: number | undefined): string | null {
  if (conf === undefined || !Number.isFinite(conf)) return null;
  const pct = conf > 0 && conf <= 1 ? conf * 100 : conf;
  return `${Math.round(pct)}%`;
}

export default function PulsePageClient() {
  const { snapshot, loading, error } = useTerminalSnapshot();
  const [selected, setSelected] = useState<(typeof AGENT_FILTERS)[number]>('ALL');

  const items = useMemo(
    () => ((snapshot?.epicon?.data ?? {}) as { items?: PulseItem[] }).items ?? [],
    [snapshot],
  );
  const filtered = useMemo(
    () => (selected === 'ALL' ? items : items.filter((item) => (item.agent ?? '').toUpperCase() === selected)),
    [items, selected],
  );
  const journalEntries = useMemo(() => {
    const raw = ((snapshot?.journal?.data ?? {}) as { entries?: JournalEntry[] }).entries ?? [];
    return [...raw].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [snapshot]);
  const latestSynthesis = journalEntries[0] ?? null;
  const eveCycle = useMemo(() => {
    const eve = (snapshot?.eve?.data ?? {}) as { currentCycle?: string; cycleId?: string };
    return eve.currentCycle ?? eve.cycleId ?? null;
  }, [snapshot]);
  const prevCycle = useMemo(() => {
    const n = parseCycleNumber(eveCycle);
    return fmtCycle(n != null ? n - 1 : null);
  }, [eveCycle]);
  const integrity = (snapshot?.integrity?.data ?? null) as IntegrityData | null;
  const currentGi = integrity?.global_integrity ?? null;
  const prevGi = useMemo(
    () =>
      items
        .filter((item) => item.cycle && item.cycle === prevCycle && typeof item.gi === 'number')
        .map((item) => item.gi as number)[0] ?? null,
    [items, prevCycle],
  );
  const giDelta = currentGi != null && prevGi != null ? currentGi - prevGi : null;
  const lanes = useMemo(() => (snapshot?.lanes ?? []) as LaneState[], [snapshot]);
  const journalLane = useMemo(() => lanes.find((l) => l.key === 'journal'), [lanes]);
  const tripwireLane = useMemo(() => lanes.find((l) => l.key === 'tripwire'), [lanes]);
  const vaultData = useMemo(() => {
    const raw = ((snapshot as Record<string, unknown> | null)?.vault as { data?: VaultData } | undefined)?.data;
    return raw ?? null;
  }, [snapshot]);

  const memoryMode = snapshot?.memory_mode;

  const resolvedState = useMemo((): ResolvedPulseState => {
    const synthTags = ((latestSynthesis as unknown as { tags?: string[] })?.tags ?? []).join(' ').toLowerCase();
    const tripwireElevated =
      tripwireLane?.state === 'degraded' ||
      synthTags.includes('tripwire') ||
      synthTags.includes('active-tripwire');
    const posture = resolvePosture(lanes, integrity, latestSynthesis, tripwireElevated);
    const synthSev = latestSynthesis?.severity ?? 'nominal';
    const tripwireActive = tripwireElevated;
    const treasuryLane = lanes.find((l) => l.key === 'vault' || l.key === 'treasury');
    const treasuryAvailable = !treasuryLane || treasuryLane.state === 'healthy';

    const giSourceLabel =
      typeof memoryMode?.gi_provenance === 'string'
        ? `${provenanceShortLabel(memoryMode.gi_provenance)} (${memoryMode.gi_provenance})`
        : integrity?.source ?? 'unknown';

    return {
      gi: currentGi,
      posture,
      severity: synthSev,
      cycle: eveCycle ?? 'C-—',
      freshness: latestSynthesis ? relTime(latestSynthesis.timestamp) : 'no synthesis',
      tripwireActive,
      treasuryAvailable,
      treasuryStatus: treasuryAvailable ? 'operational' : (treasuryLane?.message ?? 'unavailable'),
      vaultBalance: vaultData?.balance_reserve ?? null,
      source: giSourceLabel,
    };
  }, [currentGi, eveCycle, integrity, lanes, latestSynthesis, memoryMode?.gi_provenance, tripwireLane?.state, vaultData]);

  const newEpiconCount = useMemo(() => {
    if (!eveCycle) return items.length;
    return items.filter((item) => item.cycle === eveCycle).length;
  }, [items, eveCycle]);
  const newJournalCount = useMemo(
    () => (prevCycle ? journalEntries.filter((entry) => entry.cycle === eveCycle).length : journalEntries.length),
    [journalEntries, eveCycle, prevCycle],
  );
  const degradedLaneCount = useMemo(() => {
    return lanes.filter((lane) => lane.state === 'degraded' || lane.state === 'offline').length;
  }, [lanes]);
  const synthesisFresh = useMemo(() => {
    const asOf = journalLane?.lastUpdated ?? latestSynthesis?.timestamp;
    return synthesisFreshness(asOf ?? undefined);
  }, [journalLane?.lastUpdated, latestSynthesis?.timestamp]);
  const whyMatters = useMemo(
    () => whyThisMatters(resolvedState, degradedLaneCount),
    [resolvedState, degradedLaneCount],
  );
  const systemStoryLine = useMemo(
    () => systemStory(resolvedState, degradedLaneCount, giDelta),
    [resolvedState, degradedLaneCount, giDelta],
  );
  const actionItems = useMemo(() => suggestedActions(resolvedState), [resolvedState]);

  const rolledEventRows = useMemo(() => {
    type Row = { kind: 'single'; item: PulseItem } | { kind: 'verify_rollup'; items: PulseItem[] };
    if (selected !== 'ALL') {
      return filtered.map((item): Row => ({ kind: 'single', item }));
    }
    const verifyItems = filtered.filter((i) => mapEventType(i) === 'VERIFY');
    const other = filtered.filter((i) => mapEventType(i) !== 'VERIFY');
    const rows: Row[] = [];
    if (verifyItems.length >= 3) {
      rows.push({ kind: 'verify_rollup', items: verifyItems });
    } else {
      verifyItems.forEach((item) => rows.push({ kind: 'single', item }));
    }
    other.forEach((item) => rows.push({ kind: 'single', item }));
    return rows;
  }, [filtered, selected]);

  const promotionCounters = ((snapshot?.promotion?.data ?? {}) as { counters?: { pending_promotable_count?: number; promoted_this_cycle_count?: number } }).counters;
  const epiconSources = ((snapshot?.epicon?.data ?? {}) as {
    sources?: { github?: number; kv?: number; ledgerApi?: number; memory?: number; memoryLedger?: number };
  }).sources;
  const journalSources = ((snapshot?.journal?.data ?? {}) as { sources?: { kv?: number; substrate?: number } }).sources;

  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  const giProvenanceTitle =
    typeof memoryMode?.gi_provenance === 'string' ? provenanceDescription(memoryMode.gi_provenance) : undefined;

  return (
    <div className="h-full overflow-y-auto p-4">
      {error && snapshot ? (
        <div
          className="mb-3 rounded border border-amber-600/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100/95"
          role="status"
        >
          Snapshot refresh failed (showing last good bundle): {error}
        </div>
      ) : null}
      {/* Canonical header — single resolved state */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">Pulse Ledger</h1>
          <span className={`rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${postureStyle(resolvedState.posture)}`}>
            {resolvedState.posture}
          </span>
          {resolvedState.tripwireActive ? (
            <span className="rounded border border-rose-500/50 bg-rose-500/15 px-2 py-0.5 text-[10px] font-mono uppercase text-rose-200">
              TRIPWIRE
            </span>
          ) : null}
          {!resolvedState.treasuryAvailable ? (
            <span className="rounded border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono uppercase text-amber-200">
              TREASURY {resolvedState.treasuryStatus}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {resolvedState.gi != null ? (
            <span className={`rounded border px-2 py-0.5 font-mono ${resolvedState.gi >= 0.85 ? 'border-emerald-500/40 text-emerald-300' : resolvedState.gi >= 0.7 ? 'border-amber-500/40 text-amber-300' : 'border-rose-500/40 text-rose-300'}`}>
              GI {resolvedState.gi.toFixed(2)}
            </span>
          ) : (
            <span className="rounded border border-slate-600 px-2 py-0.5 font-mono text-slate-400">GI —</span>
          )}
          <span className="text-slate-500">{resolvedState.cycle}</span>
          <span className="text-slate-400">{filtered.length} entries</span>
          {snapshot?.timestamp ? (
            <span className="text-slate-600" title="Terminal snapshot bundle time">
              bundle {relTime(snapshot.timestamp)}
            </span>
          ) : null}
        </div>
      </div>

      <section className="mb-3 space-y-2 rounded border border-slate-700/80 bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-300">
        <div>
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300/90">System story</div>
          <p className="text-slate-200">{systemStoryLine}</p>
        </div>
        <p className="border-t border-slate-800 pt-2 text-slate-400">{whyMatters}</p>
        <div className="border-t border-slate-800 pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Suggested actions</div>
          <ul className="list-inside list-disc space-y-0.5 text-slate-400">
            {actionItems.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Agent filter tabs — scrollable, never clipped */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {AGENT_FILTERS.map((name) => (
          <button
            key={name}
            onClick={() => setSelected(name)}
            className={`shrink-0 rounded border px-2.5 py-1 text-[11px] font-mono ${selected === name ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-100' : 'border-slate-700 text-slate-400'}`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Delta panel */}
      <section className="mb-3 rounded border border-slate-800 bg-slate-900/60 p-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">DELTA</div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">EPICON +{newEpiconCount}</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">JOURNAL +{newJournalCount}</span>
          {degradedLaneCount > 0 ? (
            <span className="rounded border border-amber-700/70 px-1.5 py-0.5 text-amber-200">degraded {degradedLaneCount}</span>
          ) : (
            <span className="rounded border border-emerald-700/50 px-1.5 py-0.5 text-emerald-200">lanes nominal</span>
          )}
          <span className={`rounded border px-1.5 py-0.5 ${giDelta != null ? (giDelta >= 0 ? 'border-emerald-700/50 text-emerald-200' : 'border-rose-700/50 text-rose-200') : 'border-slate-700 text-slate-400'}`}>
            {giDelta != null ? `GI Δ ${giDelta >= 0 ? '+' : ''}${giDelta.toFixed(2)}` : 'GI Δ unchanged'}
          </span>
          {promotionCounters && (
            <>
              <span className="rounded border border-sky-700/50 px-1.5 py-0.5 text-sky-200">
                {promotionCounters.pending_promotable_count ?? 0} pending
              </span>
              <span className="rounded border border-emerald-700/50 px-1.5 py-0.5 text-emerald-200">
                {promotionCounters.promoted_this_cycle_count ?? 0} promoted
              </span>
            </>
          )}
        </div>
      </section>

      {/* Latest synthesis — with resolved GI and semantic split */}
      <section className="mb-3 rounded border border-cyan-700/40 bg-cyan-950/20 p-2.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">LATEST SYNTHESIS</div>
        {latestSynthesis ? (
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span
                className="cursor-help rounded border border-slate-600 px-1 py-0.5 font-mono text-slate-400"
                title="Global Integrity — composite operator signal (0–1). Not a citizen score."
              >
                GI?
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono uppercase ${
                  synthesisFresh.tier === 'live' || synthesisFresh.tier === 'fresh'
                    ? 'border-emerald-600/50 text-emerald-200'
                    : synthesisFresh.tier === 'delayed'
                      ? 'border-amber-600/50 text-amber-200'
                      : synthesisFresh.tier === 'stale'
                        ? 'border-rose-600/50 text-rose-200'
                        : 'border-slate-600 text-slate-500'
                }`}
                title={synthesisFresh.line}
              >
                data: {synthesisFresh.tier}
              </span>
              <span className="rounded border border-cyan-600/50 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-100">{latestSynthesis.agent}</span>
              <span className="text-slate-500">{relTime(latestSynthesis.timestamp)}</span>
              <span className={`rounded border px-1.5 py-0.5 ${sevStyle(latestSynthesis.severity ?? 'nominal')}`}>
                sev {latestSynthesis.severity ?? 'nominal'}
              </span>
              {formatConfidence(latestSynthesis.confidence) ? (
                <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300">
                  conf {formatConfidence(latestSynthesis.confidence)}
                </span>
              ) : null}
              {resolvedState.gi != null ? (
                <span
                  className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-slate-300"
                  title={giProvenanceTitle}
                >
                  GI {resolvedState.gi.toFixed(2)} · {resolvedState.source}
                </span>
              ) : null}
            </div>
            <p className="mb-1.5 text-[10px] text-slate-500">
              {synthesisFresh.line}
              {journalLane?.lastUpdated ? (
                <span className="block text-slate-600">
                  Journal lane as-of: {relTime(journalLane.lastUpdated)}
                  {journalLane.message ? ` · ${journalLane.message}` : ''}
                </span>
              ) : null}
            </p>
            <div className="space-y-1.5 text-[11px] leading-snug">
              <p className="text-slate-200">
                <span className="mr-1 rounded border border-slate-600 bg-slate-900/80 px-1 py-0.5 text-[9px] font-mono text-slate-400" title="From agent journal — not ledger-attested fact">
                  OBSERVED
                </span>
                {latestSynthesis.observation}
              </p>
              <p className="text-slate-200">
                <span className="mr-1 rounded border border-cyan-700/50 bg-cyan-950/40 px-1 py-0.5 text-[9px] font-mono text-cyan-300/90" title="Agent reasoning — verify before treating as settled">
                  INFERRED
                </span>
                {latestSynthesis.inference}
              </p>
              {latestSynthesis.recommendation.trim().length > 0 &&
              latestSynthesis.recommendation.trim() !== latestSynthesis.inference.trim() ? (
                <p className="text-slate-200">
                  <span className="mr-1 rounded border border-emerald-700/50 bg-emerald-950/30 px-1 py-0.5 text-[9px] font-mono text-emerald-300/90" title="Suggested operator response — not automatic execution">
                    RECOMMENDED
                  </span>
                  {latestSynthesis.recommendation}
                </p>
              ) : latestSynthesis.recommendation.trim().length === 0 ? (
                <p className="text-slate-400">
                  <span className="mr-1 rounded border border-slate-700 px-1 py-0.5 text-[9px] font-mono text-slate-500" title="No separate recommendation field on this entry">
                    RECOMMENDED
                  </span>
                  (none — inference only for this synthesis row)
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400">No journal synthesis available yet in this cycle.</div>
        )}
      </section>

      {/* Sources */}
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

      {/* Event list */}
      <div className="space-y-2">
        {rolledEventRows.map((row, idx) =>
          row.kind === 'verify_rollup' ? (
            <details
              key={`verify-rollup-${idx}`}
              className="rounded border border-amber-700/40 bg-amber-950/20 p-2.5 md:p-3"
            >
              <summary className="cursor-pointer list-none text-[11px] text-amber-100/95">
                <span className="rounded border border-amber-600/50 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                  VERIFY ×{row.items.length}
                </span>
                <span className="ml-2 text-slate-400">Repeated verification events — expand for list</span>
              </summary>
              <div className="mt-2 space-y-2 border-t border-amber-900/40 pt-2">
                {row.items.map((item) => (
                  <article key={item.id} className="rounded border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-xs font-medium text-slate-200">{item.title ?? item.id}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {item.agent ?? 'SYSTEM'} · {relTime(item.timestamp)}
                    </div>
                  </article>
                ))}
              </div>
            </details>
          ) : (
            <article key={row.item.id} className="rounded border border-slate-800 bg-slate-900/60 p-2.5 md:p-3">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
                <span className="rounded border border-cyan-600/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-100">
                  {mapEventType(row.item)}
                </span>
                {mapEventType(row.item) === 'VERIFY' ? (
                  <span
                    className="rounded border border-sky-700/50 bg-sky-950/40 px-1 py-0.5 text-[9px] font-mono text-sky-200/90"
                    title="Lane verification — not ledger attestation"
                  >
                    VERIFIED
                  </span>
                ) : null}
                <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-slate-400">{row.item.agent ?? 'SYSTEM'}</span>
                <span className="text-slate-500">{row.item.status ?? 'active'}</span>
              </div>
              <div className="text-sm font-semibold leading-snug text-slate-100">
                {row.item.title ?? 'Untitled EPICON event'}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <span>{row.item.timestamp ?? '—'}</span>
                <span>{relTime(row.item.timestamp)}</span>
                <span>sev {row.item.severity ?? 'unknown'}</span>
                <span>MII {row.item.mii_score ?? '—'}</span>
              </div>
              <details className="mt-1.5 text-[10px] text-slate-500">
                <summary className="cursor-pointer list-none text-slate-500 underline decoration-dotted underline-offset-2">
                  More details
                </summary>
                <div className="mt-1 space-y-0.5">
                  <div>source {row.item.source ?? '—'} · id {row.item.id}</div>
                  {row.item.category ? <div>category {row.item.category}</div> : null}
                  {row.item.cycle ? <div>cycle {row.item.cycle}</div> : null}
                  {row.item.tags?.length ? <div>tags {row.item.tags.join(', ')}</div> : null}
                </div>
              </details>
            </article>
          ),
        )}
      </div>
    </div>
  );
}
