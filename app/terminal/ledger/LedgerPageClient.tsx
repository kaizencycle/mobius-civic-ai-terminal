'use client';

import { useEffect, useMemo, useState } from 'react';
import ChamberEmptyState from '@/components/terminal/ChamberEmptyState';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';

type EpiconLedgerItem = {
  id: string;
  timestamp: string;
  author: string;
  title: string;
  type: 'merge' | 'heartbeat' | 'zeus-verify' | string;
  severity: 'nominal' | 'degraded' | 'elevated' | 'critical' | 'info' | string;
  tags: string[];
  source: string;
  verified: boolean;
  sha?: string;
  gi?: number | null;
};

type FeedResponse = {
  count?: number;
  items?: EpiconLedgerItem[];
  sources?: { ledgerApi?: number };
};

function rowTone(item: EpiconLedgerItem): string {
  if (item.type === 'merge') return 'border-cyan-500/40 bg-cyan-950/20';
  if (item.type === 'zeus-verify') return 'border-amber-500/40 bg-amber-950/20';
  if (item.type === 'heartbeat') {
    if (item.severity === 'critical' || item.severity === 'degraded') return 'border-rose-500/40 bg-rose-950/20';
    return 'border-amber-500/40 bg-amber-950/20';
  }
  return 'border-slate-800 bg-slate-900/60';
}

function iconFor(item: EpiconLedgerItem): string {
  if (item.type === 'merge') return '⎇';
  if (item.type === 'zeus-verify') return '◈';
  if (item.type === 'heartbeat') return '❤';
  return '•';
}

export default function LedgerPageClient() {
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [authorFilter, setAuthorFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/epicon/feed?limit=60', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setFeed(json as FeedResponse))
      .catch(() => setFeed({ items: [] }));
  }, []);

  const entries = feed?.items ?? [];
  const authors = useMemo(() => ['ALL', ...new Set(entries.map((e) => e.author || 'unknown'))], [entries]);
  const filtered = useMemo(
    () => (authorFilter === 'ALL' ? entries : entries.filter((entry) => (entry.author || 'unknown') === authorFilter)),
    [entries, authorFilter],
  );

  if (!feed) return <ChamberSkeleton blocks={10} />;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 rounded border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
        Showing EPICON feed · Civic Ledger bridge pending AGENT_SERVICE_TOKEN
      </div>

      {entries.length === 0 ? (
        <ChamberEmptyState
          title="No ledger entries yet"
          reason="The EPICON feed has not emitted entries yet for this environment."
          action="Try again after the next automation cycle."
          actionDetail="Once AGENT_SERVICE_TOKEN is configured, ledger bridge data will appear here automatically."
        />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span>Author</span>
            <select
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
            >
              {authors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span className="text-slate-500">{feed.count ?? entries.length} total</span>
          </div>
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div key={entry.id} className={`rounded border p-3 ${rowTone(entry)}`}>
                <button
                  onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  className="w-full text-left text-xs text-slate-200"
                >
                  <span className="mr-1">{iconFor(entry)}</span>
                  {entry.title} · {entry.type} · {entry.author} · {entry.timestamp}
                </button>
                <div className="mt-1 text-[11px] text-slate-400">
                  {entry.sha ? `sha ${entry.sha.slice(0, 10)}… · ` : ''}
                  source {entry.source} · severity {entry.severity} · verified {String(entry.verified)}
                </div>
                {expanded === entry.id ? (
                  <pre className="mt-2 overflow-x-auto text-[11px] text-slate-500">{JSON.stringify(entry, null, 2)}</pre>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
