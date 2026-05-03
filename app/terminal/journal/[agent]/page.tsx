'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Entry = { id: string; agent: string; category?: string; timestamp: string; observation?: string };

export default function AgentJournalPage() {
  const params = useParams<{ agent: string }>();
  const [entries, setEntries] = useState<Entry[]>([]);
  const agent = useMemo(() => decodeURIComponent(params?.agent ?? ''), [params?.agent]);

  useEffect(() => {
    if (!agent) return;
    fetch(`/api/agents/journal?agent=${encodeURIComponent(agent)}&limit=200`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setEntries((json.entries ?? []) as Entry[]))
      .catch(() => undefined);
  }, [agent]);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 text-sm font-semibold">{agent} journal</div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-mono text-slate-500">{entry.category ?? 'journal'}</div>
            <div className="text-xs text-slate-300">{entry.observation ?? '—'}</div>
            <div className="text-xs text-slate-500">{entry.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
