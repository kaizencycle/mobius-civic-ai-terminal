'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JournalEntryCard from '@/components/terminal/journal/JournalEntryCard';
import ChamberEmptyState from '@/components/terminal/ChamberEmptyState';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useJournalChamber, type DvaTier } from '@/hooks/useJournalChamber';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { JournalDisplayEntry, JournalDisplaySeverity, JournalDisplayStatus } from '@/lib/journal/types';

const AGENTS = ['ATLAS', 'ZEUS', 'EVE', 'AUREA', 'HERMES', 'JADE', 'DAEDALUS', 'ECHO'] as const;
const AGENT_FILTER_ORDER = ['ALL', 'EVE', 'ATLAS', 'ZEUS', 'HERMES', 'JADE', 'AUREA', 'DAEDALUS', 'ECHO'] as const;

const AGENT_PILL_STYLE: Record<string, { border: string; activeBg: string; text: string }> = {
  ALL: { border: 'border-slate-600', activeBg: 'bg-slate-700/40', text: 'text-slate-100' },
  ATLAS: { border: 'border-cyan-600/50', activeBg: 'bg-cyan-500/15', text: 'text-cyan-100' },
  EVE: { border: 'border-rose-500/50', activeBg: 'bg-rose-500/15', text: 'text-rose-100' },
  ZEUS: { border: 'border-amber-600/50', activeBg: 'bg-amber-600/15', text: 'text-amber-100' },
  JADE: { border: 'border-emerald-600/50', activeBg: 'bg-emerald-600/15', text: 'text-emerald-100' },
  HERMES: { border: 'border-orange-600/50', activeBg: 'bg-orange-600/15', text: 'text-orange-100' },
  AUREA: { border: 'border-amber-500/50', activeBg: 'bg-amber-500/15', text: 'text-amber-50' },
  DAEDALUS: { border: 'border-amber-900/60', activeBg: 'bg-amber-950/40', text: 'text-amber-200' },
  ECHO: { border: 'border-slate-500/50', activeBg: 'bg-slate-600/20', text: 'text-slate-100' },
};

const DVA_TIERS: Array<{ id: DvaTier; label: string; desc: string; color: string; border: string; activeBg: string }> = [
  { id: 'ALL', label: 'ALL', desc: 'All agents', color: 'text-slate-100', border: 'border-slate-600', activeBg: 'bg-slate-700/40' },
  { id: 't2', label: 'SENTINEL', desc: 'ATLAS + ZEUS · Verification', color: 'text-cyan-100', border: 'border-cyan-600/50', activeBg: 'bg-cyan-500/15' },
  { id: 'sentinel', label: 'COUNCIL', desc: 'ATLAS + ZEUS + EVE · Council', color: 'text-amber-100', border: 'border-amber-600/50', activeBg: 'bg-amber-500/15' },
  { id: 't3', label: 'STABILIZE', desc: 'EVE + JADE + HERMES · Flow', color: 'text-emerald-100', border: 'border-emerald-600/50', activeBg: 'bg-emerald-500/15' },
  { id: 'architects', label: 'ARCHITECTS', desc: 'AUREA + DAEDALUS · Synthesis', color: 'text-violet-100', border: 'border-violet-600/50', activeBg: 'bg-violet-500/15' },
  { id: 't1', label: 'SUBSTRATE', desc: 'ECHO · Event memory', color: 'text-slate-300', border: 'border-slate-500/50', activeBg: 'bg-slate-600/20' },
];

const DVA_TIER_AGENT_MAP: Record<Exclude<DvaTier, 'ALL'>, readonly string[]> = {
  t1: ['ECHO'],
  t2: ['ATLAS', 'ZEUS'],
  t3: ['EVE', 'JADE', 'HERMES'],
  sentinel: ['ATLAS', 'ZEUS', 'EVE'],
  architects: ['AUREA', 'DAEDALUS'],
};

const CURRENT_CYCLE_REFRESH_MS = 60_000;

type EpiconItem = {
  id: string;
  timestamp: string;
  author: string;
  title: string;
  type: string;
  tags: string[];
  source: string;
  severity: string;
};

function normalizeAgentName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}
function resolveDvaTierAgents(tier: DvaTier): readonly string[] {
  return tier === 'ALL' ? [] : DVA_TIER_AGENT_MAP[tier] ?? [];
}
function journalEntryAgent(entry: JournalDisplayEntry): string {
  const candidate = entry as JournalDisplayEntry & { agentOrigin?: string; sourceAgent?: string; author?: string };
  return normalizeAgentName(candidate.agentOrigin) || normalizeAgentName(candidate.agent) || normalizeAgentName(candidate.sourceAgent) || normalizeAgentName(candidate.author);
}
function entryMatchesDvaTier(entry: JournalDisplayEntry, tier: DvaTier): boolean {
  const allowed = resolveDvaTierAgents(tier);
  if (allowed.length === 0) return true;
  const agent = journalEntryAgent(entry);
  return agent.length > 0 && allowed.includes(agent);
}
function isDerivableEpiconItem(item: EpiconItem): boolean {
  return item.type === 'zeus-verify' || item.author === 'cursor-agent' || item.author === 'mobius-bot' || item.type === 'heartbeat';
}
function deriveAgent(item: EpiconItem): string {
  const tags = (item.tags ?? []).map((tag) => tag.toLowerCase());
  if (item.type === 'zeus-verify') return 'ZEUS';
  if (item.type === 'heartbeat') return 'ATLAS';
  if (tags.includes('atlas')) return 'ATLAS';
  if (item.author === 'mobius-bot') return 'ECHO';
  return 'ATLAS';
}
function epiconSeverityToJournal(sev: string): JournalDisplaySeverity {
  const s = sev.toLowerCase();
  if (s === 'critical' || s === 'high') return 'critical';
  if (s === 'elevated' || s === 'medium') return 'elevated';
  return 'nominal';
}
function toDerivedEntry(item: EpiconItem, cycle: string): JournalDisplayEntry {
  return {
    id: `derived-${item.id}`,
    agent: deriveAgent(item),
    cycle,
    category: item.type,
    observation: item.title,
    inference: `${item.type} observed via EPICON ${item.source}.`,
    recommendation: 'Continue monitoring until native substrate journals are online.',
    source: 'epicon-derived',
    timestamp: item.timestamp,
    status: item.type === 'zeus-verify' ? 'verified' : 'committed',
    severity: epiconSeverityToJournal(item.severity ?? 'nominal'),
  };
}
function parseCycleOrdinal(cycle: string | undefined): number {
  const c = cycle?.trim() ?? '';
  const n = parseInt(c.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
function statusRank(s: JournalDisplayStatus | undefined): number {
  if (s === 'verified') return 4;
  if (s === 'committed') return 3;
  if (s === 'contested') return 2;
  if (s === 'draft') return 1;
  return 2;
}
function severityRank(s: JournalDisplaySeverity | undefined): number {
  if (s === 'critical') return 3;
  if (s === 'elevated') return 2;
  if (s === 'nominal') return 1;
  return 0;
}
function sortJournalOperatorFirst(rows: JournalDisplayEntry[], focusCycleId: string): JournalDisplayEntry[] {
  const focus = focusCycleId.trim();
  return [...rows].sort((a, b) => {
    const aCurrent = (a.cycle?.trim() ?? '') === focus ? 1 : 0;
    const bCurrent = (b.cycle?.trim() ?? '') === focus ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    const cycA = parseCycleOrdinal(a.cycle);
    const cycB = parseCycleOrdinal(b.cycle);
    if (cycA !== cycB) return cycB - cycA;
    const stA = statusRank(a.status);
    const stB = statusRank(b.status);
    if (stA !== stB) return stB - stA;
    const sevA = severityRank(a.severity);
    const sevB = severityRank(b.severity);
    if (sevA !== sevB) return sevB - sevA;
    const confA = typeof a.confidence === 'number' && Number.isFinite(a.confidence) ? a.confidence : -1;
    const confB = typeof b.confidence === 'number' && Number.isFinite(b.confidence) ? b.confidence : -1;
    if (confA !== confB) return confB - confA;
    return new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime();
  });
}

export default function JournalPageClient() {
  const [currentCycle, setCurrentCycle] = useState(() => currentCycleId());
  const [entries, setEntries] = useState<JournalDisplayEntry[] | null>(null);
  const [agent, setAgent] = useState('ALL');
  const [cycleTab, setCycleTab] = useState<string>('All');
  const [derivedMode, setDerivedMode] = useState(false);
  const [readMode, setReadMode] = useState<'hot' | 'canon' | 'merged'>('hot');
  const [dvaTier, setDvaTier] = useState<DvaTier>('ALL');
  const journal = useJournalChamber(true, readMode, 100, dvaTier);
  const journalEntries = useMemo(() => (journal.data?.entries ?? []) as JournalDisplayEntry[], [journal.data?.entries]);
  const activeTier = useMemo(() => DVA_TIERS.find((tier) => tier.id === dvaTier), [dvaTier]);
  const [missingRelatedId, setMissingRelatedId] = useState<string | null>(null);
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const missingRelatedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const refreshCurrentCycle = () => setCurrentCycle((previous) => {
      const next = currentCycleId();
      return previous === next ? previous : next;
    });
    refreshCurrentCycle();
    const timerId = window.setInterval(refreshCurrentCycle, CURRENT_CYCLE_REFRESH_MS);
    return () => window.clearInterval(timerId);
  }, []);

  const clearMissingRelatedTimer = useCallback(() => {
    if (missingRelatedTimerRef.current !== null) {
      window.clearTimeout(missingRelatedTimerRef.current);
      missingRelatedTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearMissingRelatedTimer, [clearMissingRelatedTimer]);
  const registerAnchor = useCallback((id: string, el: HTMLElement | null) => {
    if (el) anchorsRef.current.set(id, el);
    else anchorsRef.current.delete(id);
  }, []);
  const onRelatedClick = useCallback((journalEntryId: string) => {
    clearMissingRelatedTimer();
    const el = anchorsRef.current.get(journalEntryId);
    if (el) {
      setMissingRelatedId(null);
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    setMissingRelatedId(journalEntryId);
    missingRelatedTimerRef.current = window.setTimeout(() => {
      setMissingRelatedId(null);
      missingRelatedTimerRef.current = null;
    }, 5000);
  }, [clearMissingRelatedTimer]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    void (async () => {
      const scopedJournalEntries = journalEntries.filter((entry) => entryMatchesDvaTier(entry, dvaTier));
      if (!mounted) return;
      if (scopedJournalEntries.length > 0) {
        setDerivedMode(false);
        setEntries(scopedJournalEntries);
        return;
      }
      if (journal.loading && !journal.error && journal.status !== 'stale') return;
      let epiconItems: EpiconItem[] = [];
      try {
        const res = await fetch('/api/epicon/feed?limit=100', { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`epicon_feed_${res.status}`);
        const data = (await res.json()) as { items?: EpiconItem[] };
        epiconItems = data.items ?? [];
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
      if (!mounted) return;
      const derived = epiconItems
        .filter(isDerivableEpiconItem)
        .map((item) => toDerivedEntry(item, currentCycle))
        .filter((entry) => entryMatchesDvaTier(entry, dvaTier));
      setDerivedMode(derived.length > 0);
      setEntries(derived);
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [journalEntries, dvaTier, journal.loading, journal.error, journal.status, currentCycle]);

  const currentCycleCount = useMemo(() => (entries ?? []).filter((entry) => (entry.cycle?.trim() ?? '') === currentCycle).length, [entries, currentCycle]);
  const latestEntryCycle = useMemo(() => sortJournalOperatorFirst(entries ?? [], currentCycle)[0]?.cycle?.trim() || null, [entries, currentCycle]);
  const shouldShowGlobalHotCycleLag = readMode === 'hot' && dvaTier === 'ALL';
  const cycleLagging = shouldShowGlobalHotCycleLag && (entries?.length ?? 0) > 0 && currentCycleCount === 0;

  const agentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries ?? []) {
      const a = (e.agent ?? '').trim() || 'UNKNOWN';
      m.set(a, (m.get(a) ?? 0) + 1);
    }
    return m;
  }, [entries]);
  const agentPills = useMemo(() => AGENT_FILTER_ORDER.map((name) => ({ name, count: name === 'ALL' ? (entries?.length ?? 0) : agentCounts.get(name) ?? 0 })), [entries, agentCounts]);
  const cycleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries ?? []) {
      const c = e.cycle?.trim();
      if (c) set.add(c);
    }
    const list = Array.from(set).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10);
      const nb = parseInt(b.replace(/\D/g, ''), 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return b.localeCompare(a);
    });
    if (!list.includes(currentCycle)) list.unshift(currentCycle);
    return ['All', ...list];
  }, [entries, currentCycle]);
  useEffect(() => {
    if (entries && cycleTab !== 'All' && !cycleOptions.includes(cycleTab)) setCycleTab(currentCycle);
  }, [cycleOptions, currentCycle, cycleTab, entries]);
  const cycleCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries ?? []) {
      const c = e.cycle?.trim();
      if (c) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [entries]);
  const filtered = useMemo(() => {
    let rows = entries ?? [];
    if (cycleTab !== 'All') rows = rows.filter((e) => (e.cycle?.trim() ?? '') === cycleTab);
    if (agent !== 'ALL') rows = rows.filter((e) => e.agent === agent);
    return sortJournalOperatorFirst(rows, currentCycle);
  }, [entries, agent, cycleTab, currentCycle]);

  if (entries === null) return <ChamberSkeleton blocks={8} />;

  return (
    <div className="h-full overflow-y-auto p-4">
      {derivedMode ? <div className="mb-3 rounded border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">Derived from EPICON feed · {dvaTier === 'ALL' ? 'all-agent fallback' : 'tier-scoped fallback'} · Native journals pending SUBSTRATE_GITHUB_TOKEN</div> : null}
      {journal.preview && !journal.full ? <div className="mb-3 rounded border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">Preview from snapshot · chamber enrichment in progress</div> : null}
      {cycleLagging ? <div className="mb-3 rounded border border-violet-500/40 bg-violet-950/20 px-3 py-2 text-xs text-violet-100">Current cycle active · <span className="font-mono">{currentCycle}</span> has no HOT entries yet. Showing latest available cycle <span className="font-mono">{latestEntryCycle ?? '—'}</span> until the next automation write.</div> : null}
      {journal.data?.scoped ? <div className="mb-3 rounded border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-300">Tier scope active · {(journal.data.tier_agents ?? []).join(' + ') || activeTier?.label || 'selected agents'}</div> : null}
      {journal.error ? <div className="mb-3 rounded border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">Journal chamber degraded · showing snapshot/derived preview</div> : null}
      {!journal.error && dvaTier !== 'ALL' && (journal.data as { fallback_reason?: string } | null)?.fallback_reason ? <div className="mb-3 rounded border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">{(journal.data as { fallback_reason?: string } | null)?.fallback_reason} · <button type="button" onClick={() => setDvaTier('ALL')} className="underline hover:text-slate-300">Show all agents</button></div> : null}
      {journal.stabilizationActive ? <div className="mb-3 rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">⚠ Predictive Stabilization Active · Preview state prioritized due to integrity drift</div> : null}

      <div className="mb-3 rounded border border-slate-800/60 bg-slate-950/40 p-2">
        <div className="mb-1.5 flex items-center justify-between"><span className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">DVA Tier · Agent Layer</span><span className="text-[9px] text-slate-600">{activeTier?.desc ?? ''}</span></div>
        <div className="flex flex-wrap gap-1.5">{DVA_TIERS.map((tier) => { const active = dvaTier === tier.id; return <button key={tier.id} type="button" aria-pressed={active} onClick={() => { setDvaTier(tier.id); setAgent('ALL'); }} className={`rounded border px-2 py-1 text-[10px] font-mono tracking-[0.12em] transition ${active ? `${tier.border} ${tier.activeBg} ${tier.color}` : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-400'}`}>{tier.label}</button>; })}</div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-[11px] font-mono"><span className="text-slate-500">Journal mode</span>{(['hot', 'canon', 'merged'] as const).map((mode) => <button key={mode} type="button" aria-pressed={readMode === mode} onClick={() => setReadMode(mode)} className={`rounded border px-2 py-1 uppercase tracking-[0.14em] ${readMode === mode ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>{mode}</button>)}</div>

      {entries.length === 0 && dvaTier !== 'ALL' ? (
        <div className="space-y-3"><div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400"><div className="mb-2 font-semibold text-slate-300">No entries for <span className="font-mono">{DVA_TIERS.find((t) => t.id === dvaTier)?.label ?? dvaTier}</span> in this view</div><p className="mb-3">The current cycle cron may not have written yet, or there are no entries matching this tier in the active window. Switch to ALL to see all available entries.</p><button type="button" onClick={() => { setDvaTier('ALL'); setCycleTab('All'); }} className="rounded border border-slate-600 px-3 py-1.5 text-slate-200 hover:border-slate-400">Show all agents · all cycles</button></div></div>
      ) : entries.length === 0 ? (
        <div className="space-y-4"><ChamberEmptyState title={`No journal entries yet for ${currentCycle}`} reason="Agent journals initialize when automations run." action="To activate: set SUBSTRATE_GITHUB_TOKEN in Vercel" actionDetail="Use a fine-grained PAT for kaizencycle/Mobius-Substrate with Contents read + write permissions." /><div className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3"><div className="text-xs text-slate-500">Journals write to Mobius-Substrate/journals/ via GitHub API on each automation cycle.</div>{AGENTS.map((agentName) => <div key={agentName} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1.5 text-xs"><span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-slate-300">{agentName}</span><span className="text-slate-600">Awaiting first entry</span></div>)}</div></div>
      ) : (
        <>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{cycleOptions.map((c) => { const count = c === 'All' ? (entries?.length ?? 0) : (cycleCounts.get(c) ?? 0); const label = c === 'All' ? `All (${count})` : `${c} (${count})`; const isCurrent = c === currentCycle; return <button key={c} type="button" aria-pressed={cycleTab === c} onClick={() => setCycleTab(c)} className={`whitespace-nowrap rounded border px-2 py-1 text-xs ${cycleTab === c ? 'border-violet-400/60 bg-violet-500/10 text-violet-100' : isCurrent ? 'border-cyan-500/40 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>{label}{isCurrent ? ' · current' : ''}</button>; })}</div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{agentPills.map(({ name, count }) => { const st = AGENT_PILL_STYLE[name] ?? AGENT_PILL_STYLE.ALL; const active = agent === name; const disabled = name !== 'ALL' && count === 0; return <button key={name} type="button" aria-pressed={active} disabled={disabled} onClick={() => setAgent(name)} className={`whitespace-nowrap rounded border px-2 py-1 text-xs transition ${active ? `${st.border} ${st.activeBg} ${st.text}` : 'border-slate-700 text-slate-500'} ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-slate-500'}`}>{name} ({count})</button>; })}</div>
          {missingRelatedId ? <div className="mb-2 rounded border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100">Source not in current window: <span className="font-mono text-amber-50">{missingRelatedId}</span></div> : null}
          <div className="space-y-2">{filtered.map((entry) => <JournalEntryCard key={entry.id} entry={entry} onRelatedClick={onRelatedClick} registerAnchor={registerAnchor} />)}</div>
        </>
      )}
    </div>
  );
}
