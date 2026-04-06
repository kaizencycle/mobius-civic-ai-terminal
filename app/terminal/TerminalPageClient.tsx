'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HardHalt from '@/components/modals/HardHalt';
import { WalletProvider } from '@/contexts/WalletContext';
import { useTerminalData, type TerminalBootstrapSeed } from '@/hooks/useTerminalData';
import { evaluateCircuitBreaker } from '@/lib/integrity-check';
import { cn } from '@/lib/utils';
import type { LedgerEntry, NavKey } from '@/lib/terminal/types';
import type { AgentJournalEntry } from '@/lib/terminal/types';
import { AGENT_MANIFESTS, AGENT_ORDER } from '@/lib/agents/manifests';
import AgentGrid from '@/components/agents/AgentGrid';
import EventScreener, { type EpiconFeedItem } from '@/components/terminal/EventScreener';
import TripwirePanel from '@/components/tripwire/TripwirePanel';
import MICWalletPanel from '@/components/terminal/MICWalletPanel';
import SentimentMap from '@/components/terminal/SentimentMap';

type AgentStatusApi = {
  id: string;
  name: string;
  role: string;
  tier?: string;
  status: 'alive' | 'idle' | 'offline';
  detail?: string;
  lastAction?: string;
  load?: number;
  uptime?: string;
};

type AgentStatusResponse = { ok: boolean; agents: AgentStatusApi[] };

type MicroSignal = { agentName: string; value: number };
type MicroAgent = { agentName: string; healthy: boolean };
type MicroSweepResponse = {
  ok: boolean;
  timestamp: string;
  composite: number;
  healthy: boolean;
  agents: MicroAgent[];
  allSignals: MicroSignal[];
};

type KvHealthResponse = { ok: boolean; latencyMs: number | null };
type EpiconFeedResponse = {
  ok: boolean;
  count: number;
  total: number;
  sources: { github: number; kv: number };
  summary: { latestGI?: number; degradedCount?: number; lastHeartbeat?: string };
  items: EpiconFeedItem[];
};
type AgentJournalResponse = {
  ok: boolean;
  count: number;
  entries: AgentJournalEntry[];
};

type SentimentDomainKey = 'civic' | 'environ' | 'financial' | 'narrative' | 'infrastructure' | 'institutional';
type SentimentDomain = {
  key: SentimentDomainKey;
  label: string;
  agent: string;
  score: number | null;
  trend: 'up' | 'down' | 'flat';
  status: 'nominal' | 'stressed' | 'critical' | 'unknown';
  sourceLabel: string;
};
type SentimentCompositeResponse = {
  ok: boolean;
  cycle: string;
  timestamp: string;
  gi: number;
  overall_sentiment: number | null;
  domains: Array<{
    key: SentimentDomainKey;
    label: string;
    agent: string;
    score: number | null;
    sourceLabel: string;
  }>;
};

const TABS: Array<{ key: NavKey; label: string }> = [
  { key: 'pulse', label: 'Pulse' },
  { key: 'ledger', label: 'Epicon' },
  { key: 'agents', label: 'Agents' },
  { key: 'infrastructure', label: 'Tripwire' },
  { key: 'sentiment', label: 'Sentiment' },
  { key: 'wallet', label: 'MIC' },
];

const TERMINAL_PREFS_KEY = 'mobius-terminal-prefs-v1';

type TerminalPageWrapperProps = {
  bootstrap?: TerminalBootstrapSeed;
};

export default function TerminalPageWrapper({ bootstrap }: TerminalPageWrapperProps) {
  return (
    <WalletProvider>
      <TerminalPage bootstrap={bootstrap} />
    </WalletProvider>
  );
}

function TerminalPage({ bootstrap }: TerminalPageWrapperProps) {
  type SortField = 'time' | 'agent' | 'type' | 'severity' | 'gi' | 'status' | 'source';
  type SortDirection = 'asc' | 'desc';

  const [selectedNav, setSelectedNav] = useState<NavKey>('pulse');
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const [expandedLedgerId, setExpandedLedgerId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [clock, setClock] = useState<string>('');
  const [agentSearch, setAgentSearch] = useState('');
  const [focusedAgent, setFocusedAgent] = useState<AgentStatusApi | null>(null);
  const [agentRoster, setAgentRoster] = useState<AgentStatusApi[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [micro, setMicro] = useState<MicroSweepResponse | null>(null);
  const [microHistory, setMicroHistory] = useState<Array<{ time: string; composite: number }>>([]);
  const [kvLatency, setKvLatency] = useState<number | null>(null);
  const [ledgerExpanded, setLedgerExpanded] = useState(false);
  const [epiconFeed, setEpiconFeed] = useState<EpiconFeedResponse | null>(null);
  const [journalFeed, setJournalFeed] = useState<AgentJournalEntry[]>([]);
  const [sentiment, setSentiment] = useState<SentimentCompositeResponse | null>(null);
  const [sentimentDomains, setSentimentDomains] = useState<SentimentDomain[]>([]);
  const [sentimentHistory, setSentimentHistory] = useState<
    Partial<Record<SentimentDomainKey, Array<{ timestamp: string; value: number | null; sourceLabel: string }>>>
  >({});
  const [ledgerView, setLedgerView] = useState<'events' | 'journal'>('events');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('time');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [resultCount, setResultCount] = useState(0);
  const [runtimeBadge, setRuntimeBadge] = useState<'online' | 'degraded' | 'offline'>('offline');
  const [hydrated, setHydrated] = useState(false);
  const agentSearchRef = useRef<HTMLInputElement>(null);

  const {
    allTripwires,
    dominantTripwireState,
    filteredEpicon,
    gi,
    integrityStatus,
    mergedLedger,
    semanticDriftDetected,
  } = useTerminalData(selectedNav, bootstrap);
  const cycleId = integrityStatus?.cycle ?? 'C-271';

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadRuntimeStatus() {
      try {
        const response = await fetch('/api/runtime/status', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Runtime status unavailable (${response.status})`);

        const data = (await response.json()) as {
          ok?: boolean;
          degraded?: boolean;
          freshness?: { status?: string };
        };

        if (!mounted) return;

        if (!data.ok) {
          setRuntimeBadge('offline');
          return;
        }

        const isFresh = data.freshness?.status === 'fresh';
        if (!data.degraded && isFresh) {
          setRuntimeBadge('online');
          return;
        }

        setRuntimeBadge('degraded');
      } catch {
        if (mounted) setRuntimeBadge('offline');
      }
    }

    loadRuntimeStatus();
    const poll = window.setInterval(loadRuntimeStatus, 15000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    }, 1000);
    setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadJournal() {
      try {
        const response = await fetch(`/api/agents/journal?cycle=${encodeURIComponent(cycleId)}`, { cache: 'no-store' });
        const json = (await response.json()) as AgentJournalResponse;
        if (mounted && json.ok) {
          setJournalFeed(json.entries ?? []);
        }
      } catch {
        if (mounted) setJournalFeed([]);
      }
    }

    loadJournal();
    const poll = window.setInterval(loadJournal, 30000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, [cycleId]);

  useEffect(() => {
    let mounted = true;

    async function loadSentiment() {
      try {
        const response = await fetch('/api/sentiment/composite', { cache: 'no-store' });
        const json = (await response.json()) as SentimentCompositeResponse;
        if (!mounted || !json.ok) return;

        setSentiment(json);
        setSentimentDomains((prev) => {
          const next: SentimentDomain[] = json.domains.map((domain) => {
            const prior = prev.find((row) => row.key === domain.key)?.score ?? null;
            const current = domain.score;
            const trend: 'up' | 'down' | 'flat' =
              prior === null || current === null ? 'flat' : current > prior ? 'up' : current < prior ? 'down' : 'flat';
            const status: SentimentDomain['status'] =
              current === null ? 'unknown' : current >= 0.8 ? 'nominal' : current >= 0.6 ? 'stressed' : 'critical';
            return { ...domain, trend, status };
          });

          const domainDefaults: Array<{ key: SentimentDomainKey; label: string; agent: string; sourceLabel: string }> = [
            { key: 'civic', label: 'CIVIC', agent: 'EVE', sourceLabel: 'Federal Register + Sonar civic' },
            { key: 'environ', label: 'ENVIRON', agent: 'GAIA', sourceLabel: 'USGS + Open-Meteo + EONET' },
            { key: 'financial', label: 'FINANCIAL', agent: 'ECHO', sourceLabel: 'crypto prices composite' },
            { key: 'narrative', label: 'NARRATIVE', agent: 'HERMES', sourceLabel: 'HN + Wikipedia + GDELT (Sonar lane conditional)' },
            { key: 'infrastructure', label: 'INFRASTR', agent: 'DAEDALUS', sourceLabel: 'GitHub + npm + self-ping' },
            { key: 'institutional', label: 'INSTITUTIONAL', agent: 'JADE', sourceLabel: 'data.gov + FRED (future)' },
          ];

          for (const fallback of domainDefaults) {
            if (!next.some((domain) => domain.key === fallback.key)) {
              next.push({
                ...fallback,
                score: null,
                trend: 'flat',
                status: 'unknown',
              });
            }
          }

          return next;
        });

        setSentimentHistory((prev) => {
          const next = { ...prev };
          for (const domain of json.domains) {
            const lane = next[domain.key] ?? [];
            next[domain.key] = [...lane, { timestamp: json.timestamp, value: domain.score, sourceLabel: domain.sourceLabel }].slice(-5);
          }
          return next;
        });
      } catch {
        // sentiment chamber degrades gracefully
      }
    }

    loadSentiment();
    const poll = window.setInterval(loadSentiment, 30000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, []);

  // Optimization 6: persist operator preferences across refreshes/session reconnects.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TERMINAL_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { selectedNav?: NavKey; agentFilter?: string; tagFilter?: string; ledgerExpanded?: boolean };
      if (parsed.selectedNav && TABS.some((tab) => tab.key === parsed.selectedNav)) setSelectedNav(parsed.selectedNav);
      if (typeof parsed.agentFilter === 'string') setAgentFilter(parsed.agentFilter);
      else if (typeof parsed.tagFilter === 'string') setAgentFilter(parsed.tagFilter === 'all' ? 'ALL' : parsed.tagFilter.toUpperCase());
      if (typeof parsed.ledgerExpanded === 'boolean') setLedgerExpanded(parsed.ledgerExpanded);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TERMINAL_PREFS_KEY, JSON.stringify({ selectedNav, agentFilter, ledgerExpanded }));
  }, [selectedNav, agentFilter, ledgerExpanded]);

  // Optimization 7: keyboard-first controls inspired by shell omnibar workflows.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === '/') {
        event.preventDefault();
        agentSearchRef.current?.focus();
        return;
      }
      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setLedgerExpanded((prev) => !prev);
        return;
      }
      if (!event.altKey) return;
      const idx = Number(event.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        event.preventDefault();
        setSelectedNav(TABS[idx].key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSidePanels() {
      const [agentsResult, microResult, kvResult] = await Promise.allSettled([
        fetch('/api/agents/status', { cache: 'no-store' }).then((r) => r.json() as Promise<AgentStatusResponse>),
        fetch('/api/signals/micro', { cache: 'no-store' }).then((r) => r.json() as Promise<MicroSweepResponse>),
        fetch('/api/kv/health', { cache: 'no-store' }).then((r) => r.json() as Promise<KvHealthResponse>),
      ]);
      if (!mounted) return;

      if (agentsResult.status === 'fulfilled' && agentsResult.value.ok) {
        setAgentRoster(agentsResult.value.agents ?? []);
      }
      setRosterLoaded(true);
      if (microResult.status === 'fulfilled' && microResult.value.ok) {
        const microJson = microResult.value;
        setMicro(microJson);
        const time = new Date(microJson.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMicroHistory((prev) => [...prev, { time, composite: microJson.composite }].slice(-12));
      }
      if (kvResult.status === 'fulfilled') {
        setKvLatency(kvResult.value.latencyMs ?? null);
      }
    }

    loadSidePanels();
    const poll = window.setInterval(loadSidePanels, 30000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadEpiconFeed() {
      try {
        const response = await fetch('/api/epicon/feed', { cache: 'no-store' });
        const json = (await response.json()) as EpiconFeedResponse;
        if (mounted && json && json.ok) {
          setEpiconFeed(json);
        }
      } catch {
        // keep screener in loading/degraded mode
      }
    }

    loadEpiconFeed();
    const poll = window.setInterval(loadEpiconFeed, 30000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, []);

  const breaker = evaluateCircuitBreaker({
    giScore: gi?.score ?? 0,
    tripwireState: dominantTripwireState,
    semanticDriftDetected,
  });
  const giScore = gi?.score ?? 0;
  const giDelta = gi?.delta ?? 0;

  const statCards: Array<{ label: string; value: string; trend: number; icon: string; subtitle: string; nav: NavKey }> = [
    { label: 'Global Integrity', value: giScore.toFixed(3), trend: giDelta, icon: '◎', subtitle: 'GI stable', nav: 'pulse' },
    { label: 'Signal Feed', value: String(filteredEpicon.length), trend: filteredEpicon.length > 8 ? 0.08 : -0.04, icon: '∿', subtitle: 'live entries', nav: 'pulse' },
    { label: 'Tripwires', value: String(allTripwires.length), trend: allTripwires.length > 0 ? -0.1 : 0.02, icon: '⚠', subtitle: '2 high / 4 medium', nav: 'infrastructure' },
    { label: 'Agents Live', value: String(agentRoster.length), trend: agentRoster.length >= 6 ? 0.05 : -0.02, icon: '◉', subtitle: 'sentinels online', nav: 'agents' },
  ];
  const chamberLabel = selectedNav === 'pulse' ? 'PULSE CHAMBER' : selectedNav === 'agents' ? 'AGENT CHAMBER' : selectedNav === 'ledger' ? 'CIVIC LEDGER CHAMBER' : selectedNav === 'infrastructure' ? 'TRIPWIRE CHAMBER' : selectedNav === 'sentiment' ? 'SENTIMENT CHAMBER' : 'MIC CHAMBER';
  const commandSurfaceTitle = selectedNav === 'wallet' ? 'Wallet Chamber' : selectedNav === 'agents' ? 'Agent Chamber' : selectedNav === 'ledger' ? 'Civic Ledger Chamber' : selectedNav === 'infrastructure' ? 'Tripwire Chamber' : selectedNav === 'sentiment' ? 'Sentiment Chamber' : 'Pulse Chamber';
  const commandSurfaceButtons: Array<{ label: string; nav: NavKey }> =
    selectedNav === 'wallet'
      ? [{ label: 'Inspect', nav: 'wallet' }, { label: 'Open Chamber', nav: 'wallet' }, { label: 'Review Signals', nav: 'pulse' }]
      : selectedNav === 'agents'
        ? [{ label: 'Inspect', nav: 'agents' }, { label: 'Open Chamber', nav: 'agents' }, { label: 'Review Signals', nav: 'ledger' }]
        : selectedNav === 'sentiment'
          ? [{ label: 'Inspect', nav: 'sentiment' }, { label: 'Open Chamber', nav: 'sentiment' }, { label: 'Review Signals', nav: 'pulse' }]
        : [{ label: 'Inspect', nav: 'infrastructure' }, { label: 'Open Chamber', nav: selectedNav }, { label: 'Review Signals', nav: 'ledger' }];
  const statusChips: Array<{ label: string; tone: string; nav: NavKey }> = [
    { label: 'ZEUS ACTIVE', tone: 'border-sky-500/40 bg-sky-500/10 text-sky-200', nav: 'agents' },
    { label: 'ECHO LIVE', tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200', nav: 'pulse' },
    { label: 'HERMES ROUTING', tone: 'border-violet-500/40 bg-violet-500/10 text-violet-200', nav: 'infrastructure' },
    { label: 'ATLAS OK', tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200', nav: 'agents' },
    { label: 'TRIPWIRE NOMINAL', tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200', nav: 'infrastructure' },
    { label: 'SENTIMENT MAP', tone: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200', nav: 'sentiment' },
    { label: 'MINTING PAUSED', tone: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200', nav: 'wallet' },
    { label: 'DEGRADED', tone: 'border-rose-500/40 bg-rose-500/10 text-rose-200', nav: 'infrastructure' },
  ];

  const agentTabs = useMemo(
    () => ['ALL', 'ATLAS', 'ZEUS', 'EVE', 'HERMES', 'AUREA', 'JADE', 'DAEDALUS', 'ECHO'],
    [],
  );

  const matchesAgentFilter = useCallback((entry: LedgerEntry, selectedAgent: string) => {
    const agentLower = selectedAgent.toLowerCase();
    const authorValue = (entry as unknown as Record<string, unknown>)['author'];
    const authorMatch = typeof authorValue === 'string' && authorValue.toLowerCase() === agentLower;
    const originMatch = entry.agentOrigin.toUpperCase() === selectedAgent;
    const tagMatch = (entry.tags ?? []).some((tag) => tag.toLowerCase() === agentLower);
    return authorMatch || originMatch || tagMatch;
  }, []);

  const agentTabCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(agentTabs.map((agent) => [agent, 0])) as Record<string, number>;
    counts.ALL = mergedLedger.length;
    for (const entry of mergedLedger) {
      for (const agent of agentTabs.slice(1)) {
        if (matchesAgentFilter(entry, agent)) counts[agent] += 1;
      }
    }
    return counts;
  }, [agentTabs, matchesAgentFilter, mergedLedger]);

  const filteredLedger = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return mergedLedger.filter((entry) => {
      if (agentFilter !== 'ALL' && !matchesAgentFilter(entry, agentFilter)) return false;
      if (!needle) return true;

      const searchable = [
        entry.id,
        entry.title ?? '',
        entry.summary,
        entry.type,
        entry.status,
        entry.agentOrigin,
        entry.source ?? '',
        ...(entry.tags ?? []),
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(needle);
    });
  }, [agentFilter, matchesAgentFilter, mergedLedger, searchQuery]);

  const sortedLedger = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1;
    const rows = [...filteredLedger];

    const rowField = (entry: LedgerEntry, field: 'severity' | 'gi') => {
      const value = (entry as unknown as Record<string, unknown>)[field];
      return typeof value === 'string' || typeof value === 'number' ? value : undefined;
    };

    const compareNullableNumbers = (a: number | undefined, b: number | undefined) => {
      const aMissing = typeof a !== 'number' || Number.isNaN(a);
      const bMissing = typeof b !== 'number' || Number.isNaN(b);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return a - b;
    };

    const rankFor = (value: string, order: string[]) => {
      const idx = order.indexOf(value.toLowerCase());
      return idx >= 0 ? idx : order.length;
    };

    const timeValue = (value: string) => {
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const agentPriority = ['atlas', 'zeus', 'eve', 'hermes', 'aurea', 'jade', 'daedalus', 'echo', 'kaizencycle', 'mobius-bot', 'cursor-agent'];
    const typePriority = ['heartbeat', 'epicon', 'zeus-verify', 'merge', 'catalog', 'attestation', 'shard', 'ubi', 'settlement'];
    const severityPriority = ['critical', 'elevated', 'degraded', 'high', 'medium', 'low', 'nominal', 'info'];
    const statusPriority = ['committed', 'verified', 'pending', 'draft', 'contested', 'reverted', 'unknown'];

    rows.sort((a, b) => {
      const compare = (() => {
        if (sortBy === 'time') return timeValue(a.timestamp) - timeValue(b.timestamp);
        if (sortBy === 'agent') {
          const agentA = (a.agentOrigin || '').toLowerCase();
          const agentB = (b.agentOrigin || '').toLowerCase();
          const rankDiff = rankFor(agentA, agentPriority) - rankFor(agentB, agentPriority);
          if (rankDiff !== 0) return rankDiff;
          return agentA.localeCompare(agentB);
        }
        if (sortBy === 'type') {
          const typeA = (a.type || '').toLowerCase();
          const typeB = (b.type || '').toLowerCase();
          const rankDiff = rankFor(typeA, typePriority) - rankFor(typeB, typePriority);
          if (rankDiff !== 0) return rankDiff;
          return typeA.localeCompare(typeB);
        }
        if (sortBy === 'severity') {
          const severityA = String(rowField(a, 'severity') ?? '').toLowerCase();
          const severityB = String(rowField(b, 'severity') ?? '').toLowerCase();
          const rankDiff = rankFor(severityA, severityPriority) - rankFor(severityB, severityPriority);
          if (rankDiff !== 0) return rankDiff;
          return severityA.localeCompare(severityB);
        }
        if (sortBy === 'gi') {
          const giA = typeof rowField(a, 'gi') === 'number' ? (rowField(a, 'gi') as number) : Number.NaN;
          const giB = typeof rowField(b, 'gi') === 'number' ? (rowField(b, 'gi') as number) : Number.NaN;
          return compareNullableNumbers(giA, giB);
        }
        if (sortBy === 'status') {
          const statusA = (a.status || 'unknown').toLowerCase();
          const statusB = (b.status || 'unknown').toLowerCase();
          const rankDiff = rankFor(statusA, statusPriority) - rankFor(statusB, statusPriority);
          if (rankDiff !== 0) return rankDiff;
          return statusA.localeCompare(statusB);
        }
        return (a.source || '').localeCompare(b.source || '');
      })();

      if (compare !== 0) return compare * direction;
      return (timeValue(b.timestamp) - timeValue(a.timestamp)) * direction;
    });

    return rows;
  }, [filteredLedger, sortBy, sortDir]);

  const visibleAgents = useMemo(() => {
    const needle = agentSearch.trim().toLowerCase();
    if (!needle) return agentRoster;
    return agentRoster.filter((agent) => `${agent.name} ${agent.role}`.toLowerCase().includes(needle));
  }, [agentRoster, agentSearch]);

  // Stable callback — never recreated, so React.memo on LedgerRow is effective
  const handleLedgerSelect = useCallback((id: string) => {
    setSelectedLedgerId(id);
    setExpandedLedgerId((prev) => (prev === id ? null : id));
  }, []);

  if (!hydrated || !gi) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-3">
          <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between">
            <div className="text-xs font-mono uppercase tracking-[0.14em] text-slate-400">Mobius Terminal</div>
            <div className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-slate-300">
              GI …
            </div>
          </div>
        </header>
      </div>
    );
  }

  const renderCenterContent = () => {
    if (selectedNav === 'agents') {
      return (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-3 border-b border-slate-800 pb-3">
            <div className="text-sm font-semibold">Agent Roster</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{cycleId} · Live agent status</div>
          </div>
          <AgentGrid />
        </section>
      );
    }
    if (selectedNav === 'ledger') {
      return (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <div className="text-sm font-semibold">Ledger Chamber</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{cycleId} · Events and reasoning journal</div>
            </div>
            <div className="inline-flex rounded-md border border-slate-700 bg-slate-950 p-0.5 text-[10px] font-mono uppercase tracking-[0.12em]">
              <button
                onClick={() => setLedgerView('events')}
                className={cn('rounded px-2 py-1', ledgerView === 'events' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400')}
              >
                Events
              </button>
              <button
                onClick={() => setLedgerView('journal')}
                className={cn('rounded px-2 py-1', ledgerView === 'journal' ? 'bg-fuchsia-500/20 text-fuchsia-200' : 'text-slate-400')}
              >
                Journal
              </button>
            </div>
          </div>
          {ledgerView === 'events' ? (
            <EventScreener
              items={epiconFeed?.items}
              summary={epiconFeed?.summary ?? {}}
              sources={epiconFeed?.sources ?? { github: 0, kv: 0 }}
              total={epiconFeed?.total ?? 0}
              searchQuery={searchQuery}
              sortBy={sortBy}
              sortDir={sortDir}
              onResultCountChange={setResultCount}
            />
          ) : (
            <JournalView entries={journalFeed} cycleId={cycleId} />
          )}
        </section>
      );
    }
    if (selectedNav === 'infrastructure') {
      return (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-3 border-b border-slate-800 pb-3">
            <div className="text-sm font-semibold">Tripwire Infrastructure</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{cycleId} · System tripwire status</div>
          </div>
          <TripwirePanel />
        </section>
      );
    }
    if (selectedNav === 'sentiment') {
      return (
        <SentimentMap
          cycleId={sentiment?.cycle ?? cycleId}
          timestamp={sentiment?.timestamp ?? new Date().toISOString()}
          gi={sentiment?.gi ?? gi.score}
          overallSentiment={sentiment?.overall_sentiment ?? null}
          domains={sentimentDomains}
          history={sentimentHistory}
          journalEntries={journalFeed}
          onAskAgent={(agent, domain) => {
            setSearchQuery(`${agent} ${domain}`);
            setSelectedNav('agents');
          }}
        />
      );
    }
    if (selectedNav === 'wallet') {
      return (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <MICWalletPanel gi={gi} integrity={null} />
        </section>
      );
    }
    // default: pulse
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.08em]">Pulse Ledger</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{cycleId} · Live signal trace</div>
            <div className="text-[10px] text-slate-500">Immutable event record — Mobius Substrate</div>
          </div>
          <div className="text-xs font-mono text-slate-400">
            {agentFilter === 'ALL'
              ? `${sortedLedger.length} entries`
              : `${sortedLedger.length} of ${mergedLedger.length} entries · ${agentFilter}`}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
          {/* Optimization 9: inline shortcut hints for faster operator discovery. */}
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1">Alt+1..6 switch chambers</span>
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1">/ focus agent search</span>
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1">L toggle ledger</span>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
          {agentTabs.map((agent) => (
            <button
              key={agent}
              onClick={() => {
                setAgentFilter(agent);
              }}
              className={cn('rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em]', getAgentTabClass(agent, agentFilter === agent))}
            >
              {agent}
              <span className="ml-1 text-[9px] text-slate-500">({agentTabCounts[agent] ?? 0})</span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {sortedLedger.slice(0, ledgerExpanded ? undefined : 14).map((entry) => (
            <LedgerRow
              key={entry.id}
              entry={entry}
              isSelected={selectedLedgerId === entry.id}
              isExpanded={expandedLedgerId === entry.id}
              onSelect={handleLedgerSelect}
            />
          ))}
        </div>
        {sortedLedger.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
            No ledger entries match this filter. Try{' '}
            <button onClick={() => setAgentFilter('ALL')} className="text-sky-300 underline underline-offset-2">
              resetting to all agents
            </button>.
          </div>
        ) : null}
        {sortedLedger.length > 14 && (
          <button
            onClick={() => setLedgerExpanded((prev) => !prev)}
            className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 transition hover:border-sky-500/40 hover:text-sky-300"
          >
            {ledgerExpanded ? '▲ collapse' : `▼ show ${sortedLedger.length - 14} more entries`}
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <HardHalt isOpen={breaker.stage === 'halt'} giScore={gi.score} reason={breaker.message} />

      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-[1800px] px-4 py-3">
          <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
            <div className="flex flex-col gap-3 xl:gap-2">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-500 text-slate-950">⌘</div>
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.12em]">MOBIUS CIVIC TERMINAL</div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{cycleId} · {chamberLabel} · LIVE SIGNAL TRACE</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Select terminal chamber"
                    value={selectedNav}
                    onChange={(event) => setSelectedNav(event.target.value as NavKey)}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-mono uppercase tracking-[0.12em] text-slate-200"
                  >
                    {TABS.map((tab) => (
                      <option key={tab.key} value={tab.key}>{tab.label}</option>
                    ))}
                  </select>
                  <span className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-mono uppercase tracking-[0.12em] text-slate-300">
                    <span className={cn('h-2 w-2 rounded-full', runtimeBadge === 'online' ? 'bg-emerald-500' : 'bg-amber-500')} />
                    {runtimeBadge.toUpperCase()}
                  </span>
                  <span className={cn(
                    'rounded-md border px-2 py-1 text-[11px] font-mono uppercase tracking-[0.12em]',
                    breaker.stage === 'nominal'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                      : breaker.stage === 'guarded'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : breaker.stage === 'containment'
                          ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                          : 'border-rose-500/40 bg-rose-500/10 text-rose-200',
                  )}>
                    {breaker.stage.toUpperCase()}
                  </span>
                  <span className="hidden rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-mono uppercase tracking-[0.12em] text-slate-400 xl:inline">
                    {clock}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-2">
                <div className="flex items-center gap-3">
                  <div className="relative max-w-sm flex-1">
                    <svg
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search events, agents, signals..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="w-full rounded-md border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-3 text-[11px] font-mono uppercase tracking-[0.06em] text-slate-300 placeholder:text-slate-600 transition-colors focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                    />
                    {searchQuery ? (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Sort</span>
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as SortField)}
                      className="cursor-pointer appearance-none rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 pr-6 text-[11px] font-mono text-slate-400 transition-colors focus:border-sky-500/50 focus:outline-none"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 6px center',
                        backgroundSize: '10px',
                      }}
                    >
                      <option value="time">Time</option>
                      <option value="agent">Agent</option>
                      <option value="type">Type</option>
                      <option value="severity">Severity</option>
                      <option value="gi">GI score</option>
                      <option value="status">Status</option>
                      <option value="source">Source</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                      className="inline-flex h-7 w-5 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-[11px] font-mono text-slate-400 transition-colors hover:border-sky-500/40 hover:text-sky-300"
                      aria-label={`Toggle sort direction (currently ${sortDir})`}
                    >
                      {sortDir === 'desc' ? '↓' : '↑'}
                    </button>
                  </div>

                  {searchQuery ? (
                    <span className="whitespace-nowrap text-[10px] font-mono text-slate-500">
                      {resultCount} result{resultCount !== 1 ? 's' : ''}
                    </span>
                  ) : null}

                  <div className="ml-auto">
                    <div
                      className={cn(
                        'rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-widest',
                        giScore > 0.85
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : giScore > 0.7
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                            : 'border-red-500/30 bg-red-500/10 text-red-400',
                      )}
                    >
                      GI {giScore.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1800px] grid-cols-12 gap-4 p-4 pb-14">
        <section className="col-span-12 grid gap-4 xl:grid-cols-[minmax(700px,2fr)_minmax(340px,1fr)]">
          <div className="space-y-4">
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {statCards.map((card) => <StatCard key={card.label} {...card} onClick={() => setSelectedNav(card.nav)} />)}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 xl:hidden">
                {statusChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => setSelectedNav(chip.nav)}
                    className={cn('whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em]', chip.tone)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-300">Integrity Trend</div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">GI · LAST 12 CYCLES · LIVE</div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono uppercase">
                  <button className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-400">1D</button>
                  <button className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-400">7C</button>
                  <button className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-400">30C</button>
                </div>
              </div>
              <MiniChart points={microHistory.length > 1 ? microHistory.map((p) => p.composite) : gi.weekly} />
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-300">Tripwire Anomalies</div>
              <div className="space-y-2">
                {allTripwires.slice(0, 4).map((tripwire) => (
                  <div key={tripwire.id} className={cn('rounded border bg-slate-950/70 p-2 text-xs', tripwire.severity.toLowerCase() === 'high' ? 'border-rose-500/40' : 'border-amber-500/30')}>
                    <div className="font-medium text-slate-200">{tripwire.label}</div>
                    <div className="font-mono uppercase text-slate-500">{tripwire.severity} · {tripwire.owner} · monitoring escalation</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-300">Command Surface</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{commandSurfaceTitle}</div>
              <div className="mt-2 text-sm text-slate-300">GI stable. {allTripwires.length} tripwires active. {filteredEpicon.length} signals in feed. {allTripwires.filter((t) => t.severity.toLowerCase() === 'high').length} alerts.</div>
              <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.14em] text-sky-300">TERMINAL LIVE · AWAITING OPERATOR ACTION</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {commandSurfaceButtons.map((action) => (
                  <button key={action.label} onClick={() => setSelectedNav(action.nav)} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs">
                    {action.label}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <section className="col-span-12">{renderCenterContent()}</section>

        <aside className="col-span-12 space-y-4 xl:col-span-3">
          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">Agent Roster</div>
              <div className="text-[10px] font-mono text-slate-500">{visibleAgents.length} online</div>
            </div>
            <input ref={agentSearchRef} value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} placeholder="Search agent" className="mb-3 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none ring-sky-500/30 focus:ring-1" />
            <div className="space-y-2">
              {!rosterLoaded
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonAgentRow key={i} />)
                : visibleAgents.slice(0, 8).map((agent) => {
                    const load = Math.min(100, Math.max(5, Math.round((agent.load ?? 0.6) * 100)));
                    return (
                      <button key={agent.id} onClick={() => setFocusedAgent(agent)} className="w-full rounded-md border border-slate-800 bg-slate-950/80 p-2 text-left">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-slate-100">{agent.name}</div>
                          <span className={cn('h-2 w-2 rounded-full', agent.status === 'offline' ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]' : agent.status === 'idle' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]')} />
                        </div>
                        <div className="text-[10px] text-slate-500">{agent.role}</div>
                        <div className="mt-2 h-1 w-16 overflow-hidden rounded bg-slate-800"><div className={cn('h-full', load > 80 ? 'bg-rose-400' : load > 60 ? 'bg-amber-400' : 'bg-sky-400')} style={{ width: `${load}%` }} /></div>
                      </button>
                    );
                  })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">Micro-Agent Signals</div>
            <div className="space-y-2">
              {!rosterLoaded
                ? Array.from({ length: 3 }).map((_, i) => <SkeletonSignalRow key={i} />)
                : (micro?.agents ?? []).map((agent) => {
                    const scored = micro?.allSignals.filter((signal) => signal.agentName === agent.agentName) ?? [];
                    const score = scored.length === 0 ? 0 : Math.round((scored.reduce((sum, signal) => sum + signal.value, 0) / scored.length) * 100);
                    const tone = score > 90 ? 'bg-emerald-400' : score > 70 ? 'bg-sky-400' : 'bg-amber-400';
                    return (
                      <div key={agent.agentName} className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
                        <div className="flex items-center justify-between text-xs"><span>{agent.agentName}</span><span className="font-mono text-slate-400">{score}%</span></div>
                        <div className="mt-1 h-1 overflow-hidden rounded bg-slate-800"><div className={tone + ' h-full transition-all'} style={{ width: `${score}%` }} /></div>
                      </div>
                    );
                  })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">System Integrity</div>
            <div className="mt-2 text-2xl font-mono font-bold text-slate-100">{giScore.toFixed(3)}</div>
            <div className="text-xs text-slate-500">Composite {micro?.composite.toFixed(3) ?? '—'} · KV {kvLatency ?? '—'}ms</div>
          </section>
        </aside>
      </main>

      {focusedAgent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setFocusedAgent(null)}>
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-4 transition" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 text-lg font-semibold">{focusedAgent.name}</div>
            <div className="text-xs text-slate-400">{focusedAgent.role} · {focusedAgent.tier ?? 'core'} tier</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-sky-400" style={{ width: `${Math.min(100, Math.round((focusedAgent.load ?? 0.6) * 100))}%` }} /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div>Status: {focusedAgent.status}</div>
              <div>Uptime: {focusedAgent.uptime ?? 'n/a'}</div>
              <div className="col-span-2">Last action: {focusedAgent.lastAction ?? 'Awaiting task'}</div>
              <div className="col-span-2">{focusedAgent.detail ?? 'Canonical substrate agent participating in consensus and signal routing.'}</div>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="rounded-md border border-slate-600 px-3 py-1.5 text-xs">Diagnostics</button>
              <button className="rounded-md border border-slate-600 px-3 py-1.5 text-xs">Logs</button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex h-7 items-center justify-between border-t border-slate-800 bg-slate-950 px-4 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />System Ready</span>
          <span>CPU 27%</span>
          <span>MEM 61%</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Latency {kvLatency ?? '--'}ms</span>
          <span>Uptime {micro?.healthy ? '99.98%' : 'degraded'}</span>
          <span>Node MOBIUS-US-EAST-1</span>
        </div>
      </footer>
    </div>
  );
}

// ── Optimization 1: React.memo prevents re-render on every 15s poll ──────────

const StatCard = memo(function StatCard({ label, value, trend, icon, subtitle, onClick }: { label: string; value: string; trend: number; icon: string; subtitle: string; onClick: () => void }) {
  const positive = trend >= 0;
  return (
    <button onClick={onClick} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-left transition hover:border-sky-500/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{label}</span>
        <span className="text-slate-500">{icon}</span>
      </div>
      <div className="text-xl font-mono font-bold text-slate-100">{value}</div>
      <div className={cn('text-[11px] font-mono', positive ? 'text-emerald-300' : 'text-rose-300')}>
        {positive ? '▲' : '▼'} {(Math.abs(trend) * 100).toFixed(1)}%
      </div>
      <div className="mt-1 text-[10px] text-slate-500">{subtitle}</div>
    </button>
  );
});

const AGENT_COLOR: Record<string, string> = {
  ATLAS: 'border-sky-500/30 text-sky-400 bg-sky-500/10',
  ZEUS: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
  EVE: 'border-rose-500/30 text-rose-400 bg-rose-500/10',
  HERMES: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
  AUREA: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  JADE: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
  DAEDALUS: 'border-stone-500/30 text-stone-400 bg-stone-500/10',
  ECHO: 'border-slate-500/30 text-slate-300 bg-slate-500/10',
};

const LEDGER_AGENT_BADGE: Record<string, { initials: string; tone: string }> = {
  ATLAS: { initials: 'AT', tone: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  ZEUS: { initials: 'ZS', tone: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  EVE: { initials: 'EV', tone: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  HERMES: { initials: 'HM', tone: 'border-orange-500/30 bg-orange-500/10 text-orange-300' },
  AUREA: { initials: 'AU', tone: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' },
  JADE: { initials: 'JD', tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  DAEDALUS: { initials: 'DA', tone: 'border-stone-500/30 bg-stone-500/10 text-stone-300' },
  ECHO: { initials: 'EC', tone: 'border-slate-500/30 bg-slate-500/10 text-slate-200' },
  'KAIZENCYCLE': { initials: 'KZ', tone: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  'MOBIUS-BOT': { initials: 'MB', tone: 'border-purple-500/30 bg-purple-500/10 text-purple-300' },
  'CURSOR-AGENT': { initials: 'CR', tone: 'border-teal-500/30 bg-teal-500/10 text-teal-300' },
};

function getAgentTabClass(agent: string, isActive: boolean) {
  if (agent === 'ALL') {
    return isActive
      ? 'border-slate-400/80 bg-slate-500/20 text-slate-100'
      : 'border-slate-700/70 bg-transparent text-slate-400';
  }
  const base = AGENT_COLOR[agent] ?? 'border-slate-700/60 text-slate-400';
  if (isActive) {
    return base
      .replace('/10', '/20')
      .replace('text-sky-400', 'text-sky-200')
      .replace('text-amber-400', 'text-amber-200')
      .replace('text-rose-400', 'text-rose-200')
      .replace('text-orange-400', 'text-orange-200')
      .replace('text-yellow-400', 'text-yellow-200')
      .replace('text-emerald-400', 'text-emerald-200')
      .replace('text-stone-400', 'text-stone-200')
      .replace('text-slate-300', 'text-slate-100')
      .replace('/30', '/70');
  }
  return base.replace('/30', '/20').replace('/10', '/0');
}

function getLedgerAgentBadge(entry: LedgerEntry) {
  const origin = entry.agentOrigin?.trim();
  const author = (entry as unknown as Record<string, unknown>)['author'];
  const normalized = (origin && origin.length > 0 ? origin : typeof author === 'string' ? author : 'ECHO').toUpperCase();
  return LEDGER_AGENT_BADGE[normalized] ?? { initials: normalized.slice(0, 2), tone: 'border-slate-600 bg-slate-800/60 text-slate-300' };
}

function JournalView({ entries, cycleId }: { entries: AgentJournalEntry[]; cycleId: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const byAgent = useMemo(() => {
    const grouped = new Map<string, AgentJournalEntry[]>();
    for (const entry of entries) {
      const lane = grouped.get(entry.agent) ?? [];
      lane.push(entry);
      grouped.set(entry.agent, lane);
    }
    return grouped;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-700 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
        No committed journal entries for {cycleId} yet. Agent reasoning will appear here as cycles run.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {AGENT_ORDER.map((agent) => {
        const rows = byAgent.get(agent) ?? [];
        const manifest = AGENT_MANIFESTS[agent];
        return (
          <div key={agent} className="rounded-md border border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase', AGENT_COLOR[agent] ?? 'border-slate-700 text-slate-300')}>
                  {agent}
                </span>
                <span className="text-[11px] text-slate-400">{manifest.scope}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{rows.length} entries</span>
            </div>
            <div className="space-y-2 p-2">
              {rows.length === 0 ? (
                <div className="rounded border border-dashed border-slate-700 bg-slate-950 p-2 text-[11px] text-slate-500">No entries yet.</div>
              ) : (
                rows.map((entry) => {
                  const isOpen = expanded[entry.id] === true;
                  return (
                    <div key={entry.id} className="rounded border border-slate-800 bg-slate-950/70">
                      <button
                        onClick={() => setExpanded((prev) => ({ ...prev, [entry.id]: !isOpen }))}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      >
                        <div>
                          <div className="text-xs font-medium text-slate-200">{entry.category} · {entry.timestamp.slice(11, 16)} UTC</div>
                          <div className="text-[11px] text-slate-400">{entry.inference}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-300">{entry.status}</span>
                          {entry.contestedBy?.length ? (
                            <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-rose-300">contested</span>
                          ) : null}
                          {entry.verifiedBy ? (
                            <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-emerald-300">verified</span>
                          ) : null}
                        </div>
                      </button>
                      {isOpen ? (
                        <div className="space-y-2 border-t border-slate-800 px-3 py-2 text-[11px] text-slate-300">
                          <div><span className="text-slate-500">Observation:</span> {entry.observation}</div>
                          <div><span className="text-slate-500">Inference:</span> {entry.inference}</div>
                          <div><span className="text-slate-500">Recommendation:</span> {entry.recommendation}</div>
                          <div className="text-[10px] font-mono text-slate-500">confidence {(entry.confidence * 100).toFixed(0)}% · severity {entry.severity}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniChart({ points }: { points: number[] }) {
  const normalized = points.length > 1 ? points : [0.5, 0.52, 0.49, 0.53, 0.55, 0.56, 0.57];
  const path = normalized.map((value, index) => {
    const x = (index / Math.max(1, normalized.length - 1)) * 100;
    const y = 100 - (Math.max(0, Math.min(1, value)) * 100);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 100" className="h-40 w-full rounded border border-slate-800 bg-slate-950/50">
      <path d={path} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
      <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#integrity-fill)" stroke="none" />
      <defs>
        <linearGradient id="integrity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Optimization 5: auto-updating relative timestamp ─────────────────────────

function useRelativeTime(timestamp: string) {
  const format = (ts: string) => {
    const diffMs = Date.now() - new Date(ts).getTime();
    if (Number.isNaN(diffMs)) return ts;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(ts).toLocaleDateString();
  };
  const [label, setLabel] = useState(() => format(timestamp));
  useEffect(() => {
    const id = window.setInterval(() => setLabel(format(timestamp)), 60_000);
    return () => window.clearInterval(id);
  }, [timestamp]);
  return label;
}

// ── Optimization 1 (continued): memo + stable callbacks via lifted state ──────

type LedgerRowProps = {
  entry: LedgerEntry;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (id: string) => void;
};

const LedgerRow = memo(function LedgerRow({ entry, isSelected, isExpanded, onSelect }: LedgerRowProps) {
  const confidence = Math.min(100, Math.max(10, Math.round(((entry.confidenceTier ?? 2) / 4) * 100)));
  const relTime = useRelativeTime(entry.timestamp);
  const badge = useMemo(() => getLedgerAgentBadge(entry), [entry]);
  const isoTime = useMemo(() => {
    const parsed = new Date(entry.timestamp);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString();
  }, [entry.timestamp]);

  const handleSelect = useCallback(() => {
    onSelect(entry.id);
  }, [onSelect, entry.id]);

  return (
    <div className={cn('rounded-md border border-slate-800 bg-slate-950/70 p-3 transition', isSelected && 'border-sky-500/30 ring-1 ring-sky-500/20')}>
      <button onClick={handleSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className={cn('flex h-5 w-5 items-center justify-center rounded-sm border text-[9px] font-mono font-medium', badge.tone)}>
              {badge.initials}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1 truncate text-sm font-medium text-slate-100">
                <span className="truncate">{entry.title ?? entry.summary}</span>
                {entry.source === 'eve-synthesis' || entry.agentOrigin === 'EVE' ? (
                  <span className="shrink-0 text-[10px] font-mono text-fuchsia-300 border border-fuchsia-400/35 rounded px-1 py-0.5">
                    EVE
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-slate-500">{entry.summary}</div>
            </div>
          </div>
          <time dateTime={isoTime} title={isoTime ?? entry.timestamp} className="shrink-0 text-right text-[10px] font-mono text-slate-500">{relTime}</time>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] font-mono uppercase text-slate-400">
          <span>{entry.agentOrigin}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800"><div className="h-full bg-emerald-400" style={{ width: `${confidence}%` }} /></div>
          <span>{entry.status ?? `${confidence}%`}</span>
          <span className="text-slate-500">→</span>
        </div>
      </button>
      {isExpanded ? (
        <div className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-300">
          <div className="mb-2 flex flex-wrap gap-1">
            {(entry.tags ?? []).map((tag) => (
              <span key={`${entry.id}-${tag}`} className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-400">{tag}</span>
            ))}
            {entry.source === 'eve-synthesis' || entry.agentOrigin === 'EVE' ? (
              <span className="rounded border border-fuchsia-400/35 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-fuchsia-300">
                EVE
              </span>
            ) : null}
          </div>
          <div className="text-right text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">hash {entry.id}</div>
        </div>
      ) : null}
    </div>
  );
});


// ── Optimization 2: Skeleton loaders ─────────────────────────────────────────

function SkeletonAgentRow() {
  return (
    <div className="w-full rounded-md border border-slate-800 bg-slate-950/80 p-2 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-16 rounded bg-slate-800" />
        <div className="h-2 w-2 rounded-full bg-slate-800" />
      </div>
      <div className="mt-1 h-2.5 w-24 rounded bg-slate-800" />
      <div className="mt-2 h-1 w-16 rounded bg-slate-800" />
    </div>
  );
}

function SkeletonSignalRow() {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 rounded bg-slate-800" />
        <div className="h-3 w-8 rounded bg-slate-800" />
      </div>
      <div className="mt-1 h-1 w-full rounded bg-slate-800" />
    </div>
  );
}
