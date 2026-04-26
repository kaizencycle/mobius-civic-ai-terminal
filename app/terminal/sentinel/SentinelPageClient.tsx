'use client';

import { useEffect, useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import { currentCycleId } from '@/lib/eve/cycle-engine';

type Agent = { id: string; name: string; role: string; status: string; liveness?: string; lastAction?: string; last_action?: string; last_seen?: string | null; last_journal_at?: string | null; confidence?: number; source_badges?: string[]; tier?: string; mii_avg?: number };
type JournalEntry = { id: string; observation?: string; cycle?: string };
type MiiEntry = { agent: string; mii: number; timestamp: string };

/** Inline SVG sparkline — zero bundle impact, no recharts needed */
function MiiSparkline({ values, color, dashed = false }: { values: number[]; color: string; dashed?: boolean }) {
  const ptsSource = values.length >= 2 ? values : Array.from({ length: 10 }, () => 0.9);
  if (ptsSource.length < 2) return null;
  const W = 240;
  const H = 40;
  const pad = 1;
  const min = Math.min(...ptsSource, 0.6);
  const max = Math.max(...ptsSource, 1);
  const range = max - min || 0.01;

  const pts = ptsSource
    .map((v, i) => {
      const x = pad + (i / (ptsSource.length - 1)) * (W - 2 * pad);
      const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="inline-block align-middle" aria-hidden="true" preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed || values.length < 2 ? '3 3' : undefined}
      />
    </svg>
  );
}

/** Canonical operator colors (C-281 journal / MII alignment) */
const AGENT_COLORS: Record<string, string> = {
  ATLAS: '#0891b2',
  EVE: '#f43f5e',
  ZEUS: '#d97706',
  JADE: '#059669',
  HERMES: '#ea580c',
  AUREA: '#f59e0b',
  DAEDALUS: '#92400e',
  ECHO: '#94a3b8',
};

const SENTINEL_LAYOUT: Array<{ name: string; x: number; y: number }> = [
  { name: 'AUREA', x: 50, y: 20 },
  { name: 'ATLAS', x: 80, y: 36 },
  { name: 'ZEUS', x: 80, y: 66 },
  { name: 'JADE', x: 58, y: 84 },
  { name: 'EVE', x: 32, y: 80 },
  { name: 'HERMES', x: 18, y: 58 },
  { name: 'ECHO', x: 20, y: 32 },
  { name: 'DAEDALUS', x: 38, y: 16 },
];

export default function SentinelPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [journalByAgent, setJournalByAgent] = useState<Record<string, JournalEntry[]>>({});
  const [miiData, setMiiData] = useState<Record<string, MiiEntry[]>>({});
  const [vaultCard, setVaultCard] = useState<{
    balance_reserve: number;
    activation_threshold: number;
    gi_threshold: number;
    sustain_cycles_required: number;
    status: string;
    preview_active: boolean;
    source_entries: number;
    gi_current: number | null;
  } | null>(null);

  useEffect(() => {
    fetch('/api/mii/feed?limit=200', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: { entries?: MiiEntry[] }) => {
        const grouped: Record<string, MiiEntry[]> = {};
        for (const entry of json.entries ?? []) {
          if (!grouped[entry.agent]) grouped[entry.agent] = [];
          grouped[entry.agent]!.push(entry);
        }
        setMiiData(grouped);
      })
      .catch(() => setMiiData({}));
  }, []);

  useEffect(() => {
    void fetch('/api/vault/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: Record<string, unknown>) => {
        if (j && j.ok === true) {
          setVaultCard({
            balance_reserve: typeof j.balance_reserve === 'number' ? j.balance_reserve : 0,
            activation_threshold: typeof j.activation_threshold === 'number' ? j.activation_threshold : 50,
            gi_threshold: typeof j.gi_threshold === 'number' ? j.gi_threshold : 0.95,
            sustain_cycles_required: typeof j.sustain_cycles_required === 'number' ? j.sustain_cycles_required : 5,
            status: typeof j.status === 'string' ? j.status : 'sealed',
            preview_active: j.preview_active === true,
            source_entries: typeof j.source_entries === 'number' ? j.source_entries : 0,
            gi_current: typeof j.gi_current === 'number' ? j.gi_current : null,
          });
        }
      })
      .catch(() => setVaultCard(null));
  }, []);

  useEffect(() => {
    void fetch('/api/agents/journal?limit=100', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: { entries?: JournalEntry[] }) => {
        const grouped: Record<string, JournalEntry[]> = {};
        for (const e of json.entries ?? []) {
          const a = (e as { agent?: string }).agent;
          if (!a) continue;
          if (!grouped[a]) grouped[a] = [];
          grouped[a]!.push(e);
        }
        setJournalByAgent(grouped);
      })
      .catch(() => setJournalByAgent({}));
  }, []);

  const latestByAgent = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [agent, entries] of Object.entries(miiData)) {
      if (entries.length > 0) out[agent] = entries[0]!.mii;
    }
    return out;
  }, [miiData]);

  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  const agents = (snapshot?.agents?.data ?? {}) as { agents?: Agent[] };
  const eveData = (snapshot?.eve?.data ?? {}) as Record<string, unknown>;
  const currentCycle =
    typeof eveData.currentCycle === 'string'
      ? eveData.currentCycle
      : typeof eveData.cycleId === 'string'
        ? eveData.cycleId
        : currentCycleId();

  const handleExpand = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
  };

  const heartbeatLive = (agents.agents ?? []).every((a) => a.status === 'active');
  const anyJournalLags = (agents.agents ?? []).some((agent) => {
    const rows = journalByAgent[agent.name] ?? [];
    const latestCycle = rows[0]?.cycle?.trim() || null;
    return Boolean(latestCycle && latestCycle !== currentCycle);
  });
  const sentinelNodes = SENTINEL_LAYOUT.map((node) => {
    const agent = (agents.agents ?? []).find((a) => a.name === node.name);
    const hbLive = Boolean(
      agent && ((agent as Agent & { heartbeat_ok?: boolean }).heartbeat_ok || agent.status === 'active'),
    );
    return {
      ...node,
      color: AGENT_COLORS[node.name] ?? '#22d3ee',
      hbLive,
      mii: latestByAgent[node.name] ?? null,
      role: agent?.role ?? 'No runtime descriptor',
    };
  });
  const liveCount = sentinelNodes.filter((node) => node.hbLive).length;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 rounded border border-slate-800/80 bg-slate-950/50 px-3 py-2 text-[10px] font-mono leading-relaxed text-slate-400">
        <span className="text-slate-500">Cycle {currentCycle}</span>
        {' · '}
        <span className={heartbeatLive ? 'text-emerald-400/90' : 'text-amber-400/90'}>
          Runtime heartbeat {heartbeatLive ? 'live (all agents)' : 'degraded / unknown'}
        </span>
        {' · '}
        <span>
          Journal badge = last <span className="text-slate-300">KV journal</span> cycle (not heartbeat). ATLAS/ZEUS update after{' '}
          <code className="text-slate-500">/api/eve/cycle-synthesize</code> cron or manual POST.
        </span>
        {anyJournalLags ? (
          <span className="mt-1 block text-amber-200/80">
            Some agents show an older journal cycle — they are still &quot;live&quot; if the right dot is green; run overnight synthesis or trigger observe/verify routes for {currentCycle}.
          </span>
        ) : null}
      </div>
      {vaultCard ? (
        <div className="mb-4 rounded border border-violet-500/35 bg-slate-950/70 px-3 py-2 font-mono text-[10px] text-slate-300">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-violet-200/90">
            <span>VAULT · {vaultCard.status.toUpperCase()}</span>
            <a href="/terminal/vault" className="text-cyan-400/80 hover:text-cyan-300">
              Open
            </a>
          </div>
          <div className="mt-1 text-slate-400">
            {(vaultCard.balance_reserve ?? 0).toFixed(2)} / {vaultCard.activation_threshold.toFixed(2)} reserve · GI gate{' '}
            {vaultCard.gi_threshold.toFixed(2)} (now {vaultCard.gi_current != null ? vaultCard.gi_current.toFixed(2) : '—'}) · sustain{' '}
            {vaultCard.sustain_cycles_required} · preview {vaultCard.preview_active ? 'on' : 'off'} · deposits {vaultCard.source_entries}
          </div>
        </div>
      ) : null}
      <section className="mb-4 rounded border border-cyan-900/40 bg-slate-950/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/90">Sentinel constellation</div>
            <div className="text-xs text-slate-400">Heartbeat and MII overlay across all chamber agents.</div>
          </div>
          <div className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] font-mono text-slate-300">
            live {liveCount}/{sentinelNodes.length}
          </div>
        </div>
        <div className="relative h-44 rounded border border-slate-800/80 bg-slate-950/70">
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="none">
            {sentinelNodes.map((from, idx) =>
              sentinelNodes.slice(idx + 1).map((to) => (
                <line
                  key={`${from.name}-${to.name}`}
                  x1={`${from.x}%`}
                  y1={`${from.y}%`}
                  x2={`${to.x}%`}
                  y2={`${to.y}%`}
                  stroke="rgba(148,163,184,0.14)"
                  strokeWidth="0.6"
                />
              )),
            )}
          </svg>
          {sentinelNodes.map((node) => (
            <div
              key={node.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              title={`${node.name} · ${node.role} · ${node.hbLive ? 'heartbeat live' : 'heartbeat stale'}`}
            >
              <div
                className={`h-3 w-3 rounded-full border ${node.hbLive ? 'border-emerald-300/70' : 'border-amber-400/70'}`}
                style={{
                  backgroundColor: node.color,
                  boxShadow: node.hbLive ? `0 0 12px ${node.color}` : undefined,
                }}
              />
              <div className="mt-1 -ml-4 w-12 text-center font-mono text-[9px] text-slate-400">{node.name}</div>
              {node.mii != null ? (
                <div className="-mt-0.5 -ml-4 w-12 text-center font-mono text-[8px] text-slate-500">{node.mii.toFixed(3)}</div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(agents.agents ?? []).map((agent) => {
          const rows = journalByAgent[agent.name] ?? [];
          const latestCycle = rows[0]?.cycle?.trim() || null;
          const journalFresh = latestCycle === currentCycle;
          return (
          <button key={agent.id} onClick={() => void handleExpand(agent.name)} className="group rounded border border-slate-800 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-700 hover:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span style={{ color: AGENT_COLORS[agent.name] ?? '#22d3ee' }}>{agent.name}</span>
                <span className={`font-mono text-xs ${(latestByAgent[agent.name] ?? 0.9) >= 0.85 ? 'text-emerald-300' : (latestByAgent[agent.name] ?? 0.9) >= 0.7 ? 'text-amber-300' : 'text-rose-300'}`}>
                  {(latestByAgent[agent.name] ?? 0.9).toFixed(3)}
                </span>
                <span className="text-[8px] text-slate-600" title="Mobius Integrity Index (0–1 scale)">/1.0</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-[9px] font-mono text-slate-500">
                <span
                  className="flex items-center gap-1"
                  title="Latest committed journal entry cycle (KV / substrate merge)"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${journalFresh ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  Jrnl {journalFresh ? currentCycle : latestCycle ?? '—'}
                </span>
                <span
                  className="flex items-center gap-1"
                  title="From /api/agents/status — KV runtime heartbeat for the fleet"
                >
                  {/* OPT-10 (C-291): use heartbeat_ok+confidence to distinguish live HB from truly stale.
                      agent.status='degraded' because journal is stale, not because HB is down. */}
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    (agent as Agent & { heartbeat_ok?: boolean }).heartbeat_ok
                      ? 'bg-emerald-400'
                      : agent.status === 'active'
                        ? 'bg-emerald-400'
                        : 'bg-amber-400'
                  }`} />
                  HB {(agent as Agent & { heartbeat_ok?: boolean }).heartbeat_ok || agent.status === 'active' ? 'live' : 'stale'}
                </span>
              </div>
            </div>
            <div className="mt-1 text-xs text-slate-400">{agent.role} · {agent.tier ?? '—'}</div>
            <div className="mt-2 text-xs text-slate-500">{agent.lastAction ?? agent.last_action ?? 'Awaiting first action this cycle.'}</div>
            <div className="mt-1 text-[10px] text-slate-500">
              {(agent.source_badges ?? []).map((b) => `[${b}]`).join(' ') || '[HB][ACT][JRN] pending'}
              {agent.confidence != null ? ` · conf ${agent.confidence.toFixed(2)}` : ''}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-slate-500">MII trend</span>
              {miiData[agent.name]?.length ? (
                <span className="text-[9px] text-emerald-400/70">{miiData[agent.name]!.length} data points</span>
              ) : (
                <span className="text-[9px] text-slate-600">no live data (placeholder)</span>
              )}
            </div>
            <div className="mt-1">
              {miiData[agent.name]?.length ? (
                <MiiSparkline
                  values={miiData[agent.name]!.slice(0, 24).map((e) => e.mii).reverse()}
                  color={AGENT_COLORS[agent.name] ?? '#22d3ee'}
                />
              ) : (
                <MiiSparkline values={Array.from({ length: 10 }, () => 0.9)} color={AGENT_COLORS[agent.name] ?? '#94a3b8'} dashed />
              )}
            </div>
          </button>
          );
        })}
      </div>
      {expanded ? (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-xs font-mono text-slate-400">{expanded} journal entries</div>
          {(journalByAgent[expanded] ?? []).slice(0, 5).map((entry) => (
            <div key={entry.id} className="mb-2 text-xs text-slate-300">[{entry.cycle ?? 'C-—'}] {entry.observation ?? '—'}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
