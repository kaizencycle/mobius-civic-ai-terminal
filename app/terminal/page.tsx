'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import HardHalt from '@/components/modals/HardHalt';
import TerminalShellFallback from '@/components/terminal/TerminalShellFallback';
import { WalletProvider } from '@/contexts/WalletContext';
import { useTerminalData } from '@/hooks/useTerminalData';
import { checkCovenantCompliance } from '@/lib/integrity-check';
import { cn } from '@/lib/utils';
import type { LedgerEntry, NavKey } from '@/lib/terminal/types';

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
  const [micro, setMicro] = useState<MicroSweepResponse | null>(null);
  const [microHistory, setMicroHistory] = useState<number[]>([]);
  const [kvLatency, setKvLatency] = useState<number | null>(null);

  const { allTripwires, filteredAgents, filteredEpicon, gi, integrityStatus, mergedLedger, streamStatus } = useTerminalData(selectedNav);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    }, 1000);
    setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSidePanels() {
      try {
        const [agentsRes, microRes, kvRes] = await Promise.all([
          fetch('/api/agents/status', { cache: 'no-store' }),
          fetch('/api/signals/micro', { cache: 'no-store' }),
          fetch('/api/kv/health', { cache: 'no-store' }),
        ]);

        const agentsJson: AgentStatusResponse = await agentsRes.json();
        const microJson: MicroSweepResponse = await microRes.json();
        const kvJson: KvHealthResponse = await kvRes.json();

        if (!mounted) return;

        if (agentsJson.ok) setAgentRoster(agentsJson.agents ?? []);
        if (microJson.ok) {
          setMicro(microJson);
          setMicroHistory((prev) => [...prev, microJson.composite].slice(-24));
        }
        setKvLatency(kvJson.latencyMs ?? null);
      } catch {
        // Keep rendering with existing hook data if side feeds fail.
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
    { label: 'Agents Live', value: String(agentRoster.length || filteredAgents.length), trend: (agentRoster.length || filteredAgents.length) >= 6 ? 0.05 : -0.02, icon: '◉' },
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

  const visibleAgents = useMemo<AgentStatusApi[]>(() => {
    const source: AgentStatusApi[] = agentRoster.length > 0
      ? agentRoster
      : filteredAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: (agent.status === 'idle' ? 'idle' : 'alive') as AgentStatusApi['status'],
        detail: agent.lastAction,
        load: undefined,
        uptime: undefined,
      }));
    const needle = agentSearch.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((agent) => `${agent.name} ${agent.role}`.toLowerCase().includes(needle));
  }, [agentRoster, filteredAgents, agentSearch]);

  if (!gi) return <TerminalShellFallback statusLabel="Booting Mobius Terminal · syncing integrity surfaces" />;

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
            <MiniChart points={microHistory.length > 1 ? microHistory : gi.weekly} />
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">Tripwire Anomalies</div>
            <div className="space-y-2">
              {allTripwires.slice(0, 6).map((tripwire) => (
                <div key={tripwire.id} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-xs">
                  <div className="font-medium text-slate-200">{tripwire.label}</div>
                  <div className="font-mono uppercase text-slate-500">{tripwire.severity} · {tripwire.owner}</div>
                </div>
              ))}
              {allTripwires.length === 0 ? <div className="text-xs text-slate-500">No active anomalies.</div> : null}
            </div>
          </section>
        </aside>

        <section className="col-span-12 rounded-lg border border-slate-800 bg-slate-900/40 p-3 xl:col-span-6">
          <MainPanel
            selectedNav={selectedNav}
            cycleId={cycleId}
            filteredLedger={filteredLedger}
            ledgerTags={ledgerTags}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            selectedLedgerId={selectedLedgerId}
            expandedLedgerId={expandedLedgerId}
            setSelectedLedgerId={setSelectedLedgerId}
            setExpandedLedgerId={setExpandedLedgerId}
            filteredEpiconCount={filteredEpicon.length}
            allTripwires={allTripwires.length}
            micSupply={integrityStatus?.mic_supply ?? 0}
          />
        </section>

        <aside className="col-span-12 space-y-4 xl:col-span-3">
          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">Agent Roster</div>
              <div className="text-[10px] font-mono text-slate-500">{visibleAgents.length} online</div>
            </div>

            <input
              value={agentSearch}
              onChange={(event) => setAgentSearch(event.target.value)}
              placeholder="Search agent"
              className="mb-3 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none ring-sky-500/30 focus:ring-1"
            />

            <div className="space-y-2">
              {visibleAgents.slice(0, 10).map((agent) => {
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
              {(micro?.agents ?? []).map((agent) => {
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

      {focusedAgent ? <AgentModal focusedAgent={focusedAgent} setFocusedAgent={setFocusedAgent} /> : null}

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex h-8 items-center justify-between border-t border-slate-800 bg-slate-950 px-4 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />System Ready</span>
          <span>CPU {Math.max(9, Math.min(99, Math.round(gi.institutionalTrust * 100)))}%</span>
          <span>MEM {Math.max(11, Math.min(99, Math.round(gi.consensusStability * 100)))}%</span>
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

function MainPanel({
  selectedNav,
  cycleId,
  filteredLedger,
  ledgerTags,
  tagFilter,
  setTagFilter,
  selectedLedgerId,
  expandedLedgerId,
  setSelectedLedgerId,
  setExpandedLedgerId,
  filteredEpiconCount,
  allTripwires,
  micSupply,
}: {
  selectedNav: NavKey;
  cycleId: string;
  filteredLedger: LedgerEntry[];
  ledgerTags: string[];
  tagFilter: string;
  setTagFilter: (tag: string) => void;
  selectedLedgerId: string | null;
  expandedLedgerId: string | null;
  setSelectedLedgerId: (id: string | null) => void;
  setExpandedLedgerId: (id: string | null) => void;
  filteredEpiconCount: number;
  allTripwires: number;
  micSupply: number;
}) {
  if (selectedNav === 'agents') {
    return (
      <PanelCard title="Agent Operations" subtitle={`${cycleId} · Canonical + micro lanes`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <TinyMetric label="Live signals" value={String(filteredEpiconCount)} />
          <TinyMetric label="Tripwires" value={String(allTripwires)} />
          <TinyMetric label="MIC supply" value={micSupply.toLocaleString()} />
        </div>
      </PanelCard>
    );
  }

  if (selectedNav === 'infrastructure') {
    return (
      <PanelCard title="Tripwire Chamber" subtitle={`${cycleId} · Infrastructure watch`}>
        <div className="text-sm text-slate-300">Tripwire alerts are visible in the left anomaly stack with live severity and ownership labels.</div>
      </PanelCard>
    );
  }

  if (selectedNav === 'wallet') {
    return (
      <PanelCard title="Wallet Chamber" subtitle={`${cycleId} · Integrity economics`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TinyMetric label="MIC supply" value={micSupply.toLocaleString()} />
          <TinyMetric label="Ledger writes" value={String(filteredLedger.length)} />
        </div>
      </PanelCard>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="text-sm font-semibold">Pulse Ledger</div>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{cycleId} · Live signal trace</div>
        </div>
        <div className="text-xs font-mono text-slate-400">{filteredLedger.length} entries</div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {ledgerTags.map((tag) => (
          <button
            key={tag}
            onClick={() => setTagFilter(tag)}
            className={cn('rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em]', tagFilter === tag ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-slate-700 bg-slate-950 text-slate-400')}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredLedger.slice(0, 14).map((entry) => (
          <LedgerRow
            key={entry.id}
            entry={entry}
            isSelected={selectedLedgerId === entry.id}
            isExpanded={expandedLedgerId === entry.id}
            onSelect={() => {
              setSelectedLedgerId(entry.id);
              setExpandedLedgerId(expandedLedgerId === entry.id ? null : entry.id);
            }}
          />
        ))}
      </div>
    </>
  );
}

function PanelCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 border-b border-slate-800 pb-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-mono text-slate-100">{value}</div>
    </div>
  );
}

function AgentModal({ focusedAgent, setFocusedAgent }: { focusedAgent: AgentStatusApi; setFocusedAgent: (agent: AgentStatusApi | null) => void }) {
  return (
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
  );
}

function StatCard({ label, value, trend, icon }: { label: string; value: string; trend: number; icon: string }) {
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

function LedgerRow({ entry, isSelected, isExpanded, onSelect }: { entry: LedgerEntry; isSelected: boolean; isExpanded: boolean; onSelect: () => void }) {
  const confidence = Math.min(100, Math.max(10, Math.round(((entry.confidenceTier ?? 2) / 4) * 100)));
  return (
    <div className={cn('rounded-md border border-slate-800 bg-slate-950/70 p-3 transition', isSelected && 'border-sky-500/30 ring-1 ring-sky-500/20')}>
      <button onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-xs font-mono text-slate-300">{entry.agentOrigin.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-100">{entry.title ?? entry.summary}</div>
              <div className="truncate text-xs text-slate-500">{entry.summary}</div>
            </div>
          </div>
          <div className="text-right text-[10px] font-mono text-slate-500">{new Date(entry.timestamp).toLocaleTimeString()}</div>
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
}
