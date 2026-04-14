'use client';

import { useEffect, useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import { currentCycleId } from '@/lib/eve/cycle-engine';

type Agent = { id: string; name: string; role: string; status: string; lastAction?: string; tier?: string; mii_avg?: number };
type JournalEntry = { id: string; observation?: string; cycle?: string };
type MiiEntry = { agent: string; mii: number; timestamp: string };

/** Inline SVG sparkline — zero bundle impact, no recharts needed */
function MiiSparkline({ values, color, dashed = false }: { values: number[]; color: string; dashed?: boolean }) {
  if (values.length < 2) return null;
  const W = 240;
  const H = 40;
  const pad = 1;
  const min = Math.min(...values, 0.6);
  const max = Math.max(...values, 1);
  const range = max - min || 0.01;

  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (W - 2 * pad);
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
        strokeDasharray={dashed ? '3 3' : undefined}
      />
    </svg>
  );
}

const AGENT_COLORS: Record<string, string> = {
  ATLAS: '#38bdf8',
  ZEUS: '#f59e0b',
  EVE: '#f43f5e',
  JADE: '#22c55e',
  HERMES: '#fb7185',
  AUREA: '#fbbf24',
  DAEDALUS: '#b45309',
  ECHO: '#cbd5e1',
};

export default function SentinelPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [journalByAgent, setJournalByAgent] = useState<Record<string, JournalEntry[]>>({});
  const [miiData, setMiiData] = useState<Record<string, MiiEntry[]>>({});

  useEffect(() => {
    fetch('/api/mii/feed', { cache: 'no-store' })
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

  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  const agents = (snapshot?.agents?.data ?? {}) as { agents?: Agent[] };
  const eveData = (snapshot?.eve?.data ?? {}) as Record<string, unknown>;
  const currentCycle =
    typeof eveData.currentCycle === 'string'
      ? eveData.currentCycle
      : typeof eveData.cycleId === 'string'
        ? eveData.cycleId
        : currentCycleId();

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

  const handleExpand = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
  };

  const latestByAgent = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [agent, entries] of Object.entries(miiData)) {
      if (entries.length > 0) out[agent] = entries[0]!.mii;
    }
    return out;
  }, [miiData]);

  const heartbeatLive = (agents.agents ?? []).every((a) => a.status === 'active');
  const anyJournalLags = (agents.agents ?? []).some((agent) => {
    const rows = journalByAgent[agent.name] ?? [];
    const latestCycle = rows[0]?.cycle?.trim() || null;
    return Boolean(latestCycle && latestCycle !== currentCycle);
  });

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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(agents.agents ?? []).map((agent) => {
          const rows = journalByAgent[agent.name] ?? [];
          const latestCycle = rows[0]?.cycle?.trim() || null;
          const journalFresh = latestCycle === currentCycle;
          return (
          <button key={agent.id} onClick={() => void handleExpand(agent.name)} className="rounded border border-slate-800 bg-slate-900/60 p-4 text-left">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {agent.name} <span className="text-cyan-300">{(latestByAgent[agent.name] ?? 0.9).toFixed(3)}</span>
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
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${agent.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  HB {agent.status === 'active' ? 'live' : 'stale'}
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-400">{agent.role} · {agent.tier ?? '—'}</div>
            <div className="mt-2 text-xs text-slate-500">{agent.lastAction ?? 'No action yet.'}</div>
            <div className="mt-2 text-xs text-cyan-200">MII trend</div>
            <div className="mt-1">
              {miiData[agent.name]?.length ? (
                <MiiSparkline
                  values={miiData[agent.name]!.slice(0, 10).map((e) => e.mii).reverse()}
                  color={AGENT_COLORS[agent.name] ?? '#22d3ee'}
                />
              ) : (
                <MiiSparkline values={Array.from({ length: 10 }, () => 0.9)} color="#64748b" dashed />
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
