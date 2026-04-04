'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HardHalt from '@/components/modals/HardHalt';
import TerminalShellFallback from '@/components/terminal/TerminalShellFallback';
import { WalletProvider } from '@/contexts/WalletContext';
import { useTerminalData } from '@/hooks/useTerminalData';
import { checkCovenantCompliance } from '@/lib/integrity-check';
import { cn } from '@/lib/utils';
import type { LedgerEntry, NavKey } from '@/lib/terminal/types';
import AgentGrid from '@/components/agents/AgentGrid';
import LedgerPanel from '@/components/terminal/LedgerPanel';
import TripwirePanel from '@/components/tripwire/TripwirePanel';
import MICWalletPanel from '@/components/terminal/MICWalletPanel';

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

const TABS: Array<{ key: NavKey; label: string }> = [
  { key: 'pulse', label: 'Pulse' },
  { key: 'agents', label: 'Agents' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'infrastructure', label: 'Tripwire' },
  { key: 'wallet', label: 'Wallet' },
];

const TERMINAL_PREFS_KEY = 'mobius-terminal-prefs-v1';

export default function TerminalPageWrapper() {
  return (
    <WalletProvider>
      <TerminalPage />
    </WalletProvider>
  );
}

function TerminalPage() {
  const [selectedNav, setSelectedNav] = useState<NavKey>('pulse');
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const [expandedLedgerId, setExpandedLedgerId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [clock, setClock] = useState<string>('');
  const [agentSearch, setAgentSearch] = useState('');
  const [focusedAgent, setFocusedAgent] = useState<AgentStatusApi | null>(null);
  const [agentRoster, setAgentRoster] = useState<AgentStatusApi[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [micro, setMicro] = useState<MicroSweepResponse | null>(null);
  const [microHistory, setMicroHistory] = useState<Array<{ time: string; composite: number }>>([]);
  const [kvLatency, setKvLatency] = useState<number | null>(null);
  const [ledgerExpanded, setLedgerExpanded] = useState(false);
  const agentSearchRef = useRef<HTMLInputElement>(null);

  const { allTripwires, filteredEpicon, gi, integrityStatus, mergedLedger, streamStatus } = useTerminalData(selectedNav);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    }, 1000);
    setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    return () => window.clearInterval(timer);
  }, []);

  // Optimization 6: persist operator preferences across refreshes/session reconnects.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TERMINAL_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { selectedNav?: NavKey; tagFilter?: string; ledgerExpanded?: boolean };
      if (parsed.selectedNav && TABS.some((tab) => tab.key === parsed.selectedNav)) setSelectedNav(parsed.selectedNav);
      if (typeof parsed.tagFilter === 'string') setTagFilter(parsed.tagFilter);
      if (typeof parsed.ledgerExpanded === 'boolean') setLedgerExpanded(parsed.ledgerExpanded);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TERMINAL_PREFS_KEY, JSON.stringify({ selectedNav, tagFilter, ledgerExpanded }));
  }, [selectedNav, tagFilter, ledgerExpanded]);

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

  const covenantStatus = checkCovenantCompliance(gi?.score ?? 0);
  const cycleId = integrityStatus?.cycle ?? 'C-270';
  const giScore = gi?.score ?? 0;
  const giDelta = gi?.delta ?? 0;

  const statCards = [
    { label: 'Global Integrity', value: giScore.toFixed(3), trend: giDelta, icon: '◎' },
    { label: 'Signal Feed', value: String(filteredEpicon.length), trend: filteredEpicon.length > 8 ? 0.08 : -0.04, icon: '∿' },
    { label: 'Tripwires', value: String(allTripwires.length), trend: allTripwires.length > 0 ? -0.1 : 0.02, icon: '⚠' },
    { label: 'Agents Live', value: String(agentRoster.length), trend: agentRoster.length >= 6 ? 0.05 : -0.02, icon: '◉' },
  ];

  const ledgerTags = useMemo(() => {
    const allTags = new Set<string>();
    for (const entry of mergedLedger) for (const tag of entry.tags ?? []) allTags.add(tag);
    return ['all', ...Array.from(allTags).slice(0, 8)];
  }, [mergedLedger]);

  const filteredLedger = useMemo(() => {
    if (tagFilter === 'all') return mergedLedger;
    return mergedLedger.filter((entry) => (entry.tags ?? []).includes(tagFilter));
  }, [mergedLedger, tagFilter]);

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

  if (!gi) return <TerminalShellFallback statusLabel="Booting Mobius Terminal · syncing integrity surfaces" />;

  const renderCenterContent = () => {
    if (selectedNav === 'agents') {
      return (
        <section className="col-span-12 rounded-lg border border-slate-800 bg-slate-900/40 p-3 xl:col-span-6">
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
        <section className="col-span-12 rounded-lg border border-slate-800 bg-slate-900/40 p-3 xl:col-span-6">
          <LedgerPanel
            entries={mergedLedger}
            selectedId={selectedLedgerId ?? undefined}
            onSelect={(entry) => handleLedgerSelect(entry.id)}
          />
        </section>
      );
    }
    if (selectedNav === 'infrastructure') {
      return (
        <section className="col-span-12 rounded-lg border border-slate-800 bg-slate-900/40 p-3 xl:col-span-6">
          <div className="mb-3 border-b border-slate-800 pb-3">
            <div className="text-sm font-semibold">Tripwire Infrastructure</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{cycleId} · System tripwire status</div>
          </div>
          <TripwirePanel />
        </section>
      );
    }
    if (selectedNav === 'wallet') {
      return (
        <section className="col-span-12 rounded-lg border border-slate-800 bg-slate-900/40 p-3 xl:col-span-6">
          <MICWalletPanel gi={gi} integrity={null} />
        </section>
      );
    }
    // default: pulse
    return (
      <section className="col-span-12 rounded-lg border border-slate-800 bg-slate-900/40 p-3 xl:col-span-6">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <div className="text-sm font-semibold">Pulse Ledger</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{cycleId} · Live signal trace</div>
          </div>
          <div className="text-xs font-mono text-slate-400">{filteredLedger.length} entries</div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
          {/* Optimization 9: inline shortcut hints for faster operator discovery. */}
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1">Alt+1..5 switch chambers</span>
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1">/ focus agent search</span>
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1">L toggle ledger</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {ledgerTags.map((tag) => (
            <button key={tag} onClick={() => setTagFilter(tag)} className={cn('rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em]', tagFilter === tag ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-slate-700 bg-slate-950 text-slate-400')}>
              {tag}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filteredLedger.slice(0, ledgerExpanded ? undefined : 14).map((entry) => (
            <LedgerRow
              key={entry.id}
              entry={entry}
              isSelected={selectedLedgerId === entry.id}
              isExpanded={expandedLedgerId === entry.id}
              onSelect={handleLedgerSelect}
            />
          ))}
        </div>
        {filteredLedger.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
            No ledger entries match this filter. Try <button onClick={() => setTagFilter('all')} className="text-sky-300 underline underline-offset-2">resetting to all tags</button>.
          </div>
        ) : null}
        {filteredLedger.length > 14 && (
          <button
            onClick={() => setLedgerExpanded((prev) => !prev)}
            className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 transition hover:border-sky-500/40 hover:text-sky-300"
          >
            {ledgerExpanded ? '▲ collapse' : `▼ show ${filteredLedger.length - 14} more entries`}
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <HardHalt isOpen={covenantStatus.status === 'HALT'} giScore={gi.score} reason="Semantic drift detected in active civic signal lanes." />

      <header className="sticky top-0 z-40 h-14 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1800px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-500 text-slate-950">⌘</div>
            <div>
              <div className="text-sm font-semibold">Mobius Civic Terminal</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400">{cycleId}</div>
            </div>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSelectedNav(tab.key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-mono uppercase tracking-[0.16em] transition',
                  selectedNav === tab.key ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="md:hidden">
            {/* Optimization 8: mobile tab selector so chamber switching is available on small screens. */}
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
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', streamStatus === 'live' ? 'bg-emerald-400' : 'bg-amber-400')} />
              {streamStatus}
            </span>
            <span className="hidden lg:inline">{clock}</span>
            <span>◔</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800">☺</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1800px] grid-cols-12 gap-4 p-4 pb-14">
        <aside className="col-span-12 space-y-4 xl:col-span-3">
          <div className="grid grid-cols-2 gap-3">
            {statCards.map((card) => <StatCard key={card.label} {...card} />)}
          </div>
          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">Integrity Trend</div>
            <MiniChart points={microHistory.length > 1 ? microHistory.map((p) => p.composite) : gi.weekly} />
          </section>
          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">Tripwire Anomalies</div>
            <div className="space-y-2">
              {allTripwires.slice(0, 4).map((tripwire) => (
                <div key={tripwire.id} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-xs">
                  <div className="font-medium text-slate-200">{tripwire.label}</div>
                  <div className="font-mono uppercase text-slate-500">{tripwire.severity} · {tripwire.owner}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        {renderCenterContent()}

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

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex h-8 items-center justify-between border-t border-slate-800 bg-slate-950 px-4 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />System Ready</span>
          <span>CPU 27%</span>
          <span>MEM 61%</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Latency {kvLatency ?? '--'}ms</span>
          <span>Uptime {micro?.healthy ? '99.98%' : 'degraded'}</span>
          <span>Node mobius-us-east-1</span>
        </div>
      </footer>
    </div>
  );
}

// ── Optimization 1: React.memo prevents re-render on every 15s poll ──────────

const StatCard = memo(function StatCard({ label, value, trend, icon }: { label: string; value: string; trend: number; icon: string }) {
  const positive = trend >= 0;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 transition hover:border-sky-500/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{label}</span>
        <span className="text-slate-500">{icon}</span>
      </div>
      <div className="text-xl font-mono font-bold text-slate-100">{value}</div>
      <div className={cn('text-[11px] font-mono', positive ? 'text-emerald-300' : 'text-rose-300')}>
        {positive ? '▲' : '▼'} {(Math.abs(trend) * 100).toFixed(1)}%
      </div>
    </div>
  );
});

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
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-xs font-mono text-slate-300">{entry.agentOrigin.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-100">{entry.title ?? entry.summary}</div>
              <div className="truncate text-xs text-slate-500">{entry.summary}</div>
            </div>
          </div>
          <time dateTime={isoTime} title={isoTime ?? entry.timestamp} className="shrink-0 text-right text-[10px] font-mono text-slate-500">{relTime}</time>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span>confidence</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800"><div className="h-full bg-emerald-400" style={{ width: `${confidence}%` }} /></div>
          <span>{confidence}%</span>
        </div>
      </button>
      {isExpanded ? (
        <div className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-300">
          <div className="mb-2 flex flex-wrap gap-1">
            {(entry.tags ?? []).map((tag) => (
              <span key={`${entry.id}-${tag}`} className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-400">{tag}</span>
            ))}
            {entry.source === 'eve-synthesis' ? <span className="rounded border border-rose-400/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-rose-300">EVE SYN</span> : null}
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
