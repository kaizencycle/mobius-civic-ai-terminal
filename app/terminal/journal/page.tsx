'use client';

import { useEffect, useMemo, useState } from 'react';

type Entry = { id: string; agent: string; category?: string; timestamp: string; observation?: string };

export default function JournalArchivePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [agent, setAgent] = useState('ALL');

  useEffect(() => {
    fetch('/api/agents/journal?limit=200', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setEntries((json.entries ?? []) as Entry[]))
      .catch(() => undefined);
  }, []);

  const agents = useMemo(() => ['ALL', ...Array.from(new Set(entries.map((e) => e.agent))).sort()], [entries]);
  const filtered = useMemo(() => (agent === 'ALL' ? entries : entries.filter((e) => e.agent === agent)), [entries, agent]);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3">
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs">
          {agents.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {filtered.map((entry) => (
          <div key={entry.id} className="rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-mono text-slate-500">{entry.agent} · {entry.category ?? 'journal'}</div>
            <div className="text-xs text-slate-300">{entry.observation ?? '—'}</div>
            <div className="text-xs text-slate-500">{entry.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
