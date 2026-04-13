'use client';

import { useEffect, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type Agent = { id: string; name: string; role: string; status: string; lastAction?: string; tier?: string; mii_avg?: number };
type JournalEntry = { id: string; observation?: string; cycle?: string };

/** Inline SVG sparkline — zero bundle impact, no recharts needed */
function MiiSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 64;
  const H = 16;
  const pad = 1;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.01;

  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (W - 2 * pad);
      const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={W} height={H} className="inline-block align-middle" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="rgb(34 211 238 / 0.7)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SentinelPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [miiData, setMiiData] = useState<Record<string, number[]>>({});

  // Preload MII history for all agents on mount so sparklines show immediately
  useEffect(() => {
    fetch('/api/mii/feed', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: { entries?: Array<{ agent: string; mii: number }> }) => {
        const grouped: Record<string, number[]> = {};
        for (const e of json.entries ?? []) {
          if (!grouped[e.agent]) grouped[e.agent] = [];
          grouped[e.agent].push(e.mii);
        }
        const sliced: Record<string, number[]> = {};
        for (const [agent, scores] of Object.entries(grouped)) {
          sliced[agent] = scores.slice(0, 10).reverse(); // oldest → newest for left-to-right render
        }
        setMiiData(sliced);
      })
      .catch(() => {});
  }, []);

  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  const agents = (snapshot?.agents?.data ?? {}) as { agents?: Agent[] };

  const handleExpand = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);

    const [journalResult, miiResult] = await Promise.allSettled([
      fetch(`/api/agents/journal?agent=${encodeURIComponent(name)}&limit=5`, { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => ({ entries: [] })),
      fetch(`/api/mii/feed?agent=${encodeURIComponent(name)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => ({ entries: [] })),
    ]);

    if (journalResult.status === 'fulfilled') {
      setJournal((journalResult.value.entries ?? []) as JournalEntry[]);
    }

    if (miiResult.status === 'fulfilled') {
      type MiiEntry = { mii: number; timestamp: string };
      const entries: MiiEntry[] = miiResult.value.entries ?? [];
      const scores = entries
        .slice(0, 10)
        .map((e) => e.mii)
        .reverse(); // oldest → newest for left-to-right rendering
      if (scores.length >= 2) {
        setMiiData((prev) => ({ ...prev, [name]: scores }));
      }
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(agents.agents ?? []).map((agent) => (
          <button key={agent.id} onClick={() => void handleExpand(agent.name)} className="rounded border border-slate-800 bg-slate-900/60 p-4 text-left">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{agent.name}</div>
              <span className={`h-2 w-2 rounded-full ${agent.status === 'alive' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </div>
            <div className="text-xs text-slate-400">{agent.role} · {agent.tier ?? '—'}</div>
            <div className="mt-2 text-xs text-slate-500">{agent.lastAction ?? 'No action yet.'}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-cyan-200">
              <span>MII avg {agent.mii_avg ?? '—'}</span>
              {miiData[agent.name] && miiData[agent.name]!.length >= 2 ? (
                <MiiSparkline values={miiData[agent.name]!} />
              ) : null}
            </div>
          </button>
        ))}
      </div>
      {expanded ? (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-xs font-mono text-slate-400">{expanded} journal entries</div>
          {journal.map((entry) => (
            <div key={entry.id} className="mb-2 text-xs text-slate-300">[{entry.cycle ?? 'C-—'}] {entry.observation ?? '—'}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
