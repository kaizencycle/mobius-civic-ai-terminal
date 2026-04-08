'use client';

import { useEffect, useState } from 'react';

type LedgerEvent = { id: string; title?: string; summary?: string; timestamp?: string; hash?: string; mii_score?: number };

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEvent[]>([]);

  useEffect(() => {
    let alive = true;
    fetch('/ledger/events?limit=50', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        setEntries((json.entries ?? json.items ?? []) as LedgerEvent[]);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-mono text-slate-500">{entry.id}</div>
            <div className="text-sm text-slate-200">{entry.title ?? entry.summary ?? 'Ledger event'}</div>
            <div className="mt-1 text-xs text-slate-400">hash: {entry.hash ?? '—'} · MII: {entry.mii_score ?? '—'}</div>
            <div className="text-xs text-slate-500">{entry.timestamp ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
