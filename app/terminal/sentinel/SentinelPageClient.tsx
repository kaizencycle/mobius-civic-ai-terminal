'use client';

import { useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type Agent = { id: string; name: string; role: string; status: string; lastAction?: string; tier?: string; mii_avg?: number };
type JournalEntry = { id: string; observation?: string; cycle?: string };

export default function SentinelPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  const agents = (snapshot?.agents?.data ?? {}) as { agents?: Agent[] };

  const handleExpand = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    const data = await fetch(`/api/agents/journal?agent=${encodeURIComponent(name)}&limit=5`, { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => ({ entries: [] }));
    setJournal((data.entries ?? []) as JournalEntry[]);
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
            <div className="mt-1 text-xs text-cyan-200">MII avg {agent.mii_avg ?? '—'}</div>
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
