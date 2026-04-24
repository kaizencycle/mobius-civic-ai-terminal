'use client';

import { useMemo } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import type { SnapshotLaneState } from '@/hooks/useTerminalSnapshot';
import { provenanceDescription, provenanceShortLabel } from '@/lib/terminal/memoryMode';

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

export default function PulsePageClient() {
  const { snapshot, loading, error } = useTerminalSnapshot();

  const items = useMemo(
    () => ((snapshot?.epicon?.data ?? {}) as { items?: PulseItem[] }).items ?? [],
    [snapshot],
  );
  const filtered = items;
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
    const treasuryLane = lanes.find((l) => l.key === 'vault');
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
  }, [filtered]);

  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  const giProvenanceTitle =
    typeof memoryMode?.gi_provenance === 'string' ? provenanceDescription(memoryMode.gi_provenance) : undefined;

  const signalCards = useMemo(() => {
    return filtered.slice(0, 12).map((item) => {
      const type = mapEventType(item);
      const confidence =
        typeof item.mii_score === 'number' && Number.isFinite(item.mii_score)
          ? Math.max(0, Math.min(1, item.mii_score / 100))
          : undefined;
      const integrityWeight =
        typeof item.gi === 'number' && currentGi != null ? Number((item.gi - currentGi).toFixed(3)) : null;
      const summary =
        item.title?.trim().length
          ? `${item.title}. ${type === 'WATCH' ? 'Review for civic-risk implications.' : 'No broad systemic disruption confirmed from this event alone.'}`
          : 'Signal captured without normalized title. Review source detail before escalation.';
      return { item, type, confidence, integrityWeight, summary };
    });
  }, [filtered, currentGi]);

  const agentRows = useMemo(() => {
    const latestByAgent = new Map<string, PulseItem>();
    for (const item of filtered) {
      const agent = (item.agent ?? 'SYSTEM').toUpperCase();
      if (!latestByAgent.has(agent)) latestByAgent.set(agent, item);
    }
    return [...latestByAgent.entries()].slice(0, 8).map(([agent, item]) => {
      const lane = lanes.find((l) => l.key.toUpperCase() === agent.toLowerCase());
      const degraded = lane?.state === 'degraded' || lane?.state === 'offline';
      const contribution =
        typeof item.gi === 'number' && currentGi != null ? Number((item.gi - currentGi).toFixed(3)) : null;
      return {
        agent,
        status: degraded ? 'DEGRADED' : 'ACTIVE',
        lastAction: item.title ?? item.type ?? item.category ?? 'No recent action detail',
        contribution,
        endpoint: item.source ?? lane?.message ?? 'snapshot',
      };
    });
  }, [filtered, lanes, currentGi]);

  const vaultStatus: 'LOCKED' | 'CHARGING' | 'READY' = useMemo(() => {
    if (currentGi == null || currentGi < 0.95) return 'LOCKED';
    if (newEpiconCount > 0 || newJournalCount > 0) return 'CHARGING';
    return 'READY';
  }, [currentGi, newEpiconCount, newJournalCount]);

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
      <div className="grid gap-4 lg:grid-cols-[200px,minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:h-fit">
          <div className="rounded border border-slate-800 bg-slate-950/70 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Pulse OS</div>
            <nav className="space-y-1 text-xs">
              {[
                ['overview', '🧠 Overview'],
                ['signals', '📡 Signals'],
                ['tripwires', '⚠️ Tripwires'],
                ['vault', '🧱 Vault'],
                ['agents', '🤖 Agents'],
                ['ledger', '📜 Ledger'],
                ['settings', '⚙️ Settings'],
              ].map(([id, label]) => (
                <a key={id} href={`#${id}`} className="block rounded border border-slate-800 px-2 py-1 text-slate-300 hover:border-cyan-500/50">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="space-y-4">
          <section id="overview" className="rounded border border-slate-700/80 bg-slate-950/70 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-lg font-semibold">Mobius Pulse Command Center</h1>
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`rounded border px-2 py-0.5 font-mono uppercase tracking-wide ${postureStyle(resolvedState.posture)}`}>{resolvedState.posture}</span>
                <span className="rounded border border-slate-700 px-2 py-0.5 font-mono text-slate-300">{resolvedState.cycle}</span>
                <span className="rounded border border-slate-700 px-2 py-0.5 text-slate-300">{filtered.length} entries</span>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <article className="rounded border border-emerald-700/50 bg-emerald-950/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.15em] text-emerald-300">Integrity</div>
                <div className="mt-1 text-3xl font-semibold text-emerald-100">{resolvedState.gi != null ? resolvedState.gi.toFixed(2) : '—'}</div>
                <div className="mt-2 text-xs text-emerald-200">
                  Delta {giDelta != null ? `${giDelta >= 0 ? '↑' : '↓'} ${Math.abs(giDelta).toFixed(2)}` : 'unavailable'}
                </div>
              </article>
              <article className="rounded border border-cyan-700/50 bg-cyan-950/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.15em] text-cyan-300">Signals</div>
                <div className="mt-1 text-3xl font-semibold text-cyan-100">{newEpiconCount}</div>
                <div className="mt-2 text-xs text-cyan-200">Active feeds this cycle</div>
              </article>
              <article className="rounded border border-rose-700/50 bg-rose-950/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.15em] text-rose-300">Tripwires</div>
                <div className="mt-1 text-3xl font-semibold text-rose-100">{resolvedState.tripwireActive ? 'ACTIVE' : 'CLEAR'}</div>
                <div className="mt-2 text-xs text-rose-200">{degradedLaneCount} degraded/offline lane(s)</div>
              </article>
            </div>
            <div className="mt-3 grid gap-2 rounded border border-slate-800 bg-slate-900/50 p-2.5 text-xs text-slate-300 md:grid-cols-[2fr,1fr]">
              <p>{systemStoryLine}</p>
              <div className="rounded border border-slate-700 p-2 text-[11px] text-slate-400">
                <div className="font-mono text-slate-300">Cycle Clock: {resolvedState.cycle}</div>
                <div>{snapshot?.timestamp ? `Bundle ${relTime(snapshot.timestamp)}` : 'Bundle timestamp unavailable'}</div>
              </div>
            </div>
          </section>

          <section id="signals" className="rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Signal intelligence layer</div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {signalCards.map(({ item, type, confidence, integrityWeight, summary }) => (
                <article key={item.id} className="rounded border border-slate-800 bg-slate-950/70 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className="rounded border border-cyan-600/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100">{type}</span>
                    <span className="text-slate-500">{relTime(item.timestamp)}</span>
                  </div>
                  <div className="mt-1 font-semibold text-slate-100">{item.title ?? 'Untitled signal'}</div>
                  <div className="mt-1 space-y-0.5 text-slate-400">
                    <div>Source: {item.source ?? 'unknown'}</div>
                    <div>Confidence: {confidence != null ? `${Math.round(confidence * 100)}%` : 'unresolved'}</div>
                    <div>Integrity weight: {integrityWeight != null ? `${integrityWeight >= 0 ? '+' : ''}${integrityWeight}` : 'unresolved'}</div>
                  </div>
                  <p className="mt-2 border-t border-slate-800 pt-1.5 text-slate-300">Why it matters: {summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="tripwires" className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Tripwire posture</div>
            <p>{whyMatters}</p>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-slate-400">
              {actionItems.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>

          <section id="agents" className="rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Agent layer</div>
            <div className="grid gap-2 md:grid-cols-2">
              {agentRows.map((agent) => (
                <article key={agent.agent} className="rounded border border-slate-800 bg-slate-950/70 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-100">{agent.agent}</div>
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${agent.status === 'ACTIVE' ? 'border-emerald-600/50 text-emerald-200' : 'border-amber-600/50 text-amber-200'}`}>{agent.status}</span>
                  </div>
                  <div className="mt-1 text-slate-400">Last: {agent.lastAction}</div>
                  <div className="mt-1 text-slate-400">
                    Contribution: {agent.contribution != null ? `${agent.contribution >= 0 ? '+' : ''}${agent.contribution} GI` : 'unresolved from snapshot'}
                  </div>
                  <div className="mt-1 text-slate-500">Endpoint: {agent.endpoint}</div>
                </article>
              ))}
            </div>
          </section>

          <section id="vault" className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Vault + MIC resource</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-slate-800 bg-slate-950/70 p-2.5 text-slate-300">
                <div>Reserve: {resolvedState.vaultBalance != null ? resolvedState.vaultBalance.toFixed(2) : 'unknown'}</div>
                <div className="mt-1">Unlock condition: GI ≥ 0.95</div>
                <div className="mt-2">
                  Status:{' '}
                  <span className={`rounded border px-1.5 py-0.5 font-mono ${vaultStatus === 'LOCKED' ? 'border-rose-600/50 text-rose-200' : vaultStatus === 'CHARGING' ? 'border-amber-600/50 text-amber-200' : 'border-emerald-600/50 text-emerald-200'}`}>
                    {vaultStatus}
                  </span>
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/70 p-2.5 text-slate-400">
                Treasury lane: {resolvedState.treasuryAvailable ? 'operational' : resolvedState.treasuryStatus}
                <div className="mt-1">GI source: {resolvedState.source}</div>
                {giProvenanceTitle ? <div className="mt-1 text-slate-500">{giProvenanceTitle}</div> : null}
              </div>
            </div>
          </section>

          <section id="ledger" className="rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Ledger timeline</div>
            <p className="mb-2 text-xs text-slate-500">
              Entries below are event records from the snapshot stream. Journal inference remains inference until ledger attested.
            </p>
            <div className="space-y-2">
              {rolledEventRows.map((row, idx) =>
                row.kind === 'verify_rollup' ? (
                  <details key={`verify-rollup-${idx}`} className="rounded border border-amber-700/40 bg-amber-950/20 p-2.5">
                    <summary className="cursor-pointer list-none text-[11px] text-amber-100/95">
                      <span className="rounded border border-amber-600/50 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase">VERIFY ×{row.items.length}</span>
                      <span className="ml-2 text-slate-400">Expand verification set</span>
                    </summary>
                  </details>
                ) : (
                  <article key={row.item.id} className="rounded border border-slate-800 bg-slate-950/70 p-2.5 text-xs">
                    <div className="font-medium text-slate-100">{row.item.title ?? row.item.id}</div>
                    <div className="mt-1 text-slate-400">
                      {row.item.timestamp ?? '—'} · {row.item.agent ?? 'SYSTEM'} · Hash/attestation: pending in this stream
                    </div>
                  </article>
                ),
              )}
            </div>
          </section>

          <section id="settings" className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Settings / data provenance</div>
            <p>Synthesis freshness: {synthesisFresh.line}</p>
            <p className="mt-1">Journal lane status: {journalLane?.state ?? 'unknown'}.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
