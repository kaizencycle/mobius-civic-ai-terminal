'use client';

import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JournalFeed } from '@/components/journal/JournalFeed';
import { JournalHeader } from '@/components/journal/JournalHeader';
import { JournalPipelinePanel } from '@/components/journal/JournalPipelinePanel';
import { JournalToolbar, type SortMode, type ViewMode } from '@/components/journal/JournalToolbar';
import type { JournalFeedCardEntry } from '@/components/journal/types';
import ChamberEmptyState from '@/components/terminal/ChamberEmptyState';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useJournalChamber, type DvaTier } from '@/hooks/useJournalChamber';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { deriveTitleFromSummary } from '@/lib/journal/deriveTitle';
import {
  sortJournalByAgent,
  sortJournalByCycle,
  sortJournalChronological,
  sortJournalOperatorFirst,
} from '@/lib/journal/operatorSort';
import type { JournalDisplayEntry, JournalDisplaySeverity } from '@/lib/journal/types';

const AGENTS = ['ATLAS', 'ZEUS', 'EVE', 'AUREA', 'HERMES', 'JADE', 'DAEDALUS', 'ECHO'] as const;

// OPT-06: C-324 mock journal seed — shown when live journals and EPICON derivation
// both return empty. Represents the ledger-503-blocked hot queue state.
const C324_MOCK_JOURNAL: JournalDisplayEntry[] = [
  {
    id: 'mock-jrl-001',
    agent: 'ATLAS',
    cycle: 'C-324',
    title: 'Sentinel watch complete · GI 0.82 · DAEDALUS auth pending',
    category: 'observation',
    observation: 'Sentinel watch complete · GI 0.82 · green · all agents checked · DAEDALUS auth pending',
    inference: 'System operating in yellow band. DAEDALUS authorization outstanding from C-319.',
    recommendation: 'Hold broad promotion. Resolve DAEDALUS auth before next cycle seal.',
    source: 'agent-journal',
    timestamp: new Date(Date.now() - 3_600_000).toISOString(),
    status: 'committed',
    severity: 'nominal',
    confidence: 0.82,
    agentOrigin: 'ATLAS',
    derivedFrom: [],
  },
  {
    id: 'mock-jrl-002',
    agent: 'ZEUS',
    cycle: 'C-324',
    title: 'Verification disputed · EPICON empty · vault/attest 404 · journal write failed 503',
    category: 'alert',
    observation: 'Verification attempt returned disputed. EPICON candidate queue empty. Vault/attest endpoint returning 404.',
    inference: 'Journal write attempt failed with ledger 503 suspended. Substrate write path is broken.',
    recommendation: 'POST /api/vault/attest to verify route health. Check Render ledger service status.',
    source: 'agent-journal',
    timestamp: new Date(Date.now() - 7_200_000).toISOString(),
    status: 'committed',
    severity: 'critical',
    confidence: 0.71,
    agentOrigin: 'ZEUS',
    derivedFrom: [],
  },
  {
    id: 'mock-jrl-003',
    agent: 'ECHO',
    cycle: 'C-324',
    title: 'Digest preview row ingested · trust weak 0.31 · pending verification',
    category: 'observation',
    observation: 'Digest preview row ingested · trust weak 0.31 · pending verification · no upstream EPICON data',
    inference: 'Single-agent ingest without ZEUS cross-verification. Trust cannot advance until ledger write path is restored.',
    recommendation: 'POST /api/echo/ingest with verified sources to boost signal. Restore ledger path.',
    source: 'agent-journal',
    timestamp: new Date(Date.now() - 900_000).toISOString(),
    status: 'committed',
    severity: 'elevated',
    confidence: 0.31,
    agentOrigin: 'ECHO',
    derivedFrom: [],
  },
];

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
  return (
    normalizeAgentName(candidate.agentOrigin)
    || normalizeAgentName(candidate.agent)
    || normalizeAgentName(candidate.sourceAgent)
    || normalizeAgentName(candidate.author)
  );
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
  const observation = item.title;
  const inference = `${item.type} observed via EPICON ${item.source}.`;
  const summaryBlob = [observation, inference].join('\n\n');
  return {
    id: `derived-${item.id}`,
    agent: deriveAgent(item),
    cycle,
    title: deriveTitleFromSummary(summaryBlob),
    category: item.type,
    observation,
    inference,
    recommendation: 'Continue monitoring until native substrate journals are online.',
    source: 'epicon-derived',
    timestamp: item.timestamp,
    status: item.type === 'zeus-verify' ? 'verified' : 'committed',
    severity: epiconSeverityToJournal(item.severity ?? 'nominal'),
  };
}

function toFeedCard(entry: JournalDisplayEntry, readMode: 'hot' | 'canon' | 'merged'): JournalFeedCardEntry {
  const agent = journalEntryAgent(entry);
  const obs = entry.observation ?? '';
  const inf = entry.inference ?? '';
  const rec = (entry.recommendation ?? '').trim();
  const summary = [obs, inf, rec && rec !== inf ? rec : ''].filter(Boolean).join('\n\n') || '—';
  const title = (entry.title ?? '').trim() || deriveTitleFromSummary(summary);
  const lane: JournalFeedCardEntry['lane'] = readMode === 'hot' ? 'HOT' : readMode === 'canon' ? 'CANON' : 'SHAPE';
  return {
    id: entry.id,
    agent,
    cycle: entry.cycle?.trim() || '—',
    lane,
    title,
    summary,
    timestamp: entry.timestamp ?? '',
    gi_at_time: entry.confidence ?? null,
    event_type: entry.category,
    tags: [],
    raw: { ...entry, title },
  };
}

export default function JournalPageClient() {
  const [currentCycle, setCurrentCycle] = useState(() => currentCycleId());
  const [entries, setEntries] = useState<JournalDisplayEntry[] | null>(null);
  const [derivedMode, setDerivedMode] = useState(false);
  const [readMode, setReadMode] = useState<'hot' | 'canon' | 'merged'>('hot');
  const [dvaTier, setDvaTier] = useState<DvaTier>('ALL');
  const [sort, setSort] = useState<SortMode>('newest');
  const [view, setView] = useState<ViewMode>('feed');
  const [search, setSearch] = useState('');
  const [activeAgents, setActiveAgents] = useState<Set<string>>(() => new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const journal = useJournalChamber(true, readMode, 100, dvaTier);
  const journalEntries = useMemo(() => (journal.data?.entries ?? []) as JournalDisplayEntry[], [journal.data?.entries]);
  const activeTier = useMemo(() => DVA_TIERS.find((tier) => tier.id === dvaTier), [dvaTier]);
  const [missingRelatedId, setMissingRelatedId] = useState<string | null>(null);
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const missingRelatedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const refreshCurrentCycle = () =>
      setCurrentCycle((previous) => {
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

  const onRelatedClick = useCallback(
    (journalEntryId: string) => {
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
    },
    [clearMissingRelatedTimer],
  );

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
      if (derived.length > 0) {
        setDerivedMode(true);
        setEntries(derived);
      } else {
        // OPT-06: C-324 mock seed as absolute fallback when both live journal
        // and EPICON derivation return empty (ledger 503 blocks lane).
        // derivedMode stays false — these are mock entries, not EPICON-derived.
        const mockSeed = C324_MOCK_JOURNAL.filter((entry) => entryMatchesDvaTier(entry, dvaTier));
        setDerivedMode(false);
        setEntries(mockSeed);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [journalEntries, dvaTier, journal.loading, journal.error, journal.status, currentCycle]);

  const currentCycleCount = useMemo(
    () => (entries ?? []).filter((entry) => (entry.cycle?.trim() ?? '') === currentCycle).length,
    [entries, currentCycle],
  );
  const latestEntryCycle = useMemo(
    () => sortJournalOperatorFirst(entries ?? [], currentCycle)[0]?.cycle?.trim() || null,
    [entries, currentCycle],
  );
  const shouldShowGlobalHotCycleLag = readMode === 'hot' && dvaTier === 'ALL';
  const cycleLagging = shouldShowGlobalHotCycleLag && (entries?.length ?? 0) > 0 && currentCycleCount === 0;

  const stats = useMemo(() => {
    const list = entries ?? [];
    const agents = new Set(list.map((e) => journalEntryAgent(e)).filter(Boolean));
    const canonCount = list.filter(
      (e) => Boolean((e as JournalDisplayEntry & { canonical_path?: string }).canonical_path) || e.source_mode === 'substrate',
    ).length;
    return {
      total: list.length,
      agentCount: agents.size,
      currentCycle,
      canonCount,
    };
  }, [entries, currentCycle]);

  const readerRows = useMemo(() => {
    const list = entries ?? [];
    const q = search.trim().toLowerCase();
    let rows = list.filter((e) => {
      if (activeAgents.size === 0) return true;
      return activeAgents.has(journalEntryAgent(e));
    });
    if (q) {
      rows = rows.filter((e) => {
        const obs = (e.observation ?? '').toLowerCase();
        const inf = (e.inference ?? '').toLowerCase();
        const ag = journalEntryAgent(e).toLowerCase();
        const cyc = (e.cycle ?? '').toLowerCase();
        const tit = (e.title ?? '').toLowerCase();
        return obs.includes(q) || inf.includes(q) || ag.includes(q) || cyc.includes(q) || tit.includes(q);
      });
    }

    let sorted: JournalDisplayEntry[];
    switch (sort) {
      case 'oldest':
        sorted = sortJournalChronological(rows, 'asc');
        break;
      case 'agent':
        sorted = sortJournalByAgent(rows);
        break;
      case 'cycle':
        sorted = sortJournalByCycle(rows);
        break;
      case 'operator':
        sorted = sortJournalOperatorFirst(rows, currentCycle);
        break;
      default:
        sorted = sortJournalChronological(rows, 'desc');
    }
    return sorted.map((e) => toFeedCard(e, readMode));
  }, [entries, search, activeAgents, sort, currentCycle, readMode]);

  function toggleAgent(agent: string) {
    if (agent === 'ALL') {
      setActiveAgents(new Set());
      return;
    }
    setActiveAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agent)) next.delete(agent);
      else next.add(agent);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (entries === null) return <ChamberSkeleton blocks={8} />;

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto p-4">
      {derivedMode ? (
        <div className="mb-3 rounded border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
          Derived from EPICON feed · {dvaTier === 'ALL' ? 'all-agent fallback' : 'tier-scoped fallback'} · Native journals
          pending SUBSTRATE_GITHUB_TOKEN
        </div>
      ) : null}
      {journal.preview && !journal.full ? (
        <div className="mb-3 rounded border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
          Preview from snapshot · chamber enrichment in progress
        </div>
      ) : null}
      {cycleLagging ? (
        <div className="mb-3 rounded border border-violet-500/40 bg-violet-950/20 px-3 py-2 text-xs text-violet-100">
          Current cycle active · <span className="font-mono">{currentCycle}</span> has no HOT entries yet. Showing latest
          available cycle <span className="font-mono">{latestEntryCycle ?? '—'}</span> until the next automation write.
        </div>
      ) : null}
      {journal.data?.scoped ? (
        <div className="mb-3 rounded border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-300">
          Tier scope active · {(journal.data.tier_agents ?? []).join(' + ') || activeTier?.label || 'selected agents'}
        </div>
      ) : null}
      {journal.error ? (
        <div className="mb-3 rounded border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
          Journal chamber degraded · showing snapshot/derived preview
        </div>
      ) : null}
      {!journal.error && dvaTier !== 'ALL' && (journal.data as { fallback_reason?: string } | null)?.fallback_reason ? (
        <div className="mb-3 rounded border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
          {(journal.data as { fallback_reason?: string } | null)?.fallback_reason} ·{' '}
          <button type="button" onClick={() => setDvaTier('ALL')} className="underline hover:text-slate-300">
            Show all agents
          </button>
        </div>
      ) : null}
      {journal.stabilizationActive ? (
        <div className="mb-3 rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          Predictive Stabilization Active · Preview state prioritized due to integrity drift
        </div>
      ) : null}

      <JournalHeader stats={stats} />

      <JournalToolbar
        sortValue={sort}
        onSortChange={setSort}
        viewValue={view}
        onViewChange={setView}
        searchValue={search}
        onSearchChange={setSearch}
        activeAgents={activeAgents}
        onAgentToggle={toggleAgent}
      />

      {entries.length === 0 && dvaTier !== 'ALL' ? (
        <div className="space-y-3">
          <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
            <div className="mb-2 font-semibold text-slate-300">
              No entries for <span className="font-mono">{DVA_TIERS.find((t) => t.id === dvaTier)?.label ?? dvaTier}</span>{' '}
              in this view
            </div>
            <p className="mb-3">
              The current cycle cron may not have written yet, or there are no entries matching this tier in the active
              window. Switch to ALL to see all available entries.
            </p>
            <button
              type="button"
              onClick={() => setDvaTier('ALL')}
              className="rounded border border-slate-600 px-3 py-1.5 text-slate-200 hover:border-slate-400"
            >
              Show all agents · all cycles
            </button>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="space-y-4">
          <ChamberEmptyState
            title={`No journal entries yet for ${currentCycle}`}
            reason="Agent journals initialize when automations run."
            action="To activate: set SUBSTRATE_GITHUB_TOKEN in Vercel"
            actionDetail="Use a fine-grained PAT for kaizencycle/Mobius-Substrate with Contents read + write permissions."
          />
          <div className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-500">
              Journals write to Mobius-Substrate/journals/ via GitHub API on each automation cycle.
            </div>
            {AGENTS.map((agentName) => (
              <div key={agentName} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1.5 text-xs">
                <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-slate-300">{agentName}</span>
                <span className="text-slate-600">Awaiting first entry</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {missingRelatedId ? (
            <div className="mb-2 rounded border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100">
              Source not in current window: <span className="font-mono text-amber-50">{missingRelatedId}</span>
            </div>
          ) : null}
          <JournalFeed
            entries={readerRows}
            view={view}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            onRelatedClick={onRelatedClick}
            registerAnchor={registerAnchor}
          />
        </>
      )}

      <details className="group mt-6 rounded-xl border border-slate-800 bg-slate-950/40 dark:border-slate-700">
        <summary className="flex cursor-pointer list-none select-none items-center gap-2 px-4 py-3 text-xs text-slate-500 hover:text-slate-400 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 ease-out group-open:rotate-90"
          />
          Pipeline & operator controls
        </summary>
        <div className="space-y-4 border-t border-slate-800 px-4 pb-4 pt-3 dark:border-slate-800">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">DVA Tier · Agent Layer</span>
              <span className="text-[9px] text-slate-600">{activeTier?.desc ?? ''}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DVA_TIERS.map((tier) => {
                const active = dvaTier === tier.id;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setDvaTier(tier.id);
                      setActiveAgents(new Set());
                    }}
                    className={`rounded border px-2 py-1 text-[10px] font-mono tracking-[0.12em] transition ${
                      active
                        ? `${tier.border} ${tier.activeBg} ${tier.color}`
                        : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {tier.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="text-slate-500">Journal mode</span>
            {(['hot', 'canon', 'merged'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={readMode === mode}
                onClick={() => setReadMode(mode)}
                className={`rounded border px-2 py-1 uppercase tracking-[0.14em] ${
                  readMode === mode
                    ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-200'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <JournalPipelinePanel />
        </div>
      </details>
    </div>
  );
}
