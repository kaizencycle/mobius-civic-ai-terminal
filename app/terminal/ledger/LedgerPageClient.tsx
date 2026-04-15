'use client';

import { useEffect, useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import type { LedgerEntry } from '@/lib/terminal/types';

type EchoFeedResponse = {
  ledger?: LedgerEntry[];
  status?: {
    cycleId?: string;
  };
};

type SortKey = 'timestamp' | 'agent' | 'category' | 'tier' | 'delta' | 'status';
type SortDir = 'asc' | 'desc';

function statusBadge(status: string) {
  if (status === 'committed') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (status === 'flagged') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
}

function sortRows(rows: LedgerEntry[], key: SortKey, dir: SortDir): LedgerEntry[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case 'timestamp':
        return m * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      case 'agent':
        return m * (a.agentOrigin ?? '').localeCompare(b.agentOrigin ?? '');
      case 'category':
        return m * (a.category ?? '').localeCompare(b.category ?? '');
      case 'tier':
        return m * ((a.confidenceTier ?? 0) - (b.confidenceTier ?? 0));
      case 'delta':
        return m * ((a.integrityDelta ?? 0) - (b.integrityDelta ?? 0));
      case 'status':
        return m * a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });
}

export default function LedgerPageClient() {
  const [feed, setFeed] = useState<EchoFeedResponse | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    fetch('/api/echo/feed', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setFeed(json as EchoFeedResponse))
      .catch(() => setFeed({ ledger: [] }));
  }, []);

  const rows = useMemo(() => feed?.ledger ?? [], [feed]);
  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const totalDelta = useMemo(() => rows.reduce((sum, row) => sum + (row.integrityDelta ?? 0), 0), [rows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  if (!feed) return <ChamberSkeleton blocks={10} />;

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 text-xs">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-slate-400">
          {feed.status?.cycleId ?? 'C-—'} · {rows.length} ledger rows
        </span>
        <span className="text-[10px] text-slate-500">
          sorted by {sortKey} {sortDir === 'asc' ? '↑' : '↓'}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-slate-400">
          No ledger rows available yet.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-800">
          <div className="grid grid-cols-[100px_80px_1fr_100px_70px_90px_80px] bg-slate-950/80 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
            <button type="button" onClick={() => toggleSort('timestamp')} className="text-left hover:text-slate-200">
              Time{arrow('timestamp')}
            </button>
            <button type="button" onClick={() => toggleSort('agent')} className="text-left hover:text-slate-200">
              Agent{arrow('agent')}
            </button>
            <span>Title</span>
            <button type="button" onClick={() => toggleSort('category')} className="text-left hover:text-slate-200">
              Category{arrow('category')}
            </button>
            <button type="button" onClick={() => toggleSort('tier')} className="text-left hover:text-slate-200">
              Tier{arrow('tier')}
            </button>
            <button type="button" onClick={() => toggleSort('delta')} className="text-left hover:text-slate-200">
              GI Δ{arrow('delta')}
            </button>
            <button type="button" onClick={() => toggleSort('status')} className="text-left hover:text-slate-200">
              Status{arrow('status')}
            </button>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-slate-800 overflow-y-auto bg-slate-900/50">
            {sorted.map((row) => (
              <div key={row.id} className="grid grid-cols-[100px_80px_1fr_100px_70px_90px_80px] items-center gap-2 px-3 py-2 text-slate-200">
                <span className="font-mono text-[11px] text-slate-400">{row.timestamp.slice(11, 19)}Z</span>
                <span className="truncate font-mono text-[10px] text-cyan-400/80" title={row.agentOrigin}>
                  {row.agentOrigin}
                </span>
                <span className="truncate" title={`${row.id} · ${row.title ?? row.summary}`}>
                  {row.title ?? row.summary}
                </span>
                <span className="text-[10px] text-slate-400">{row.category ?? '—'}</span>
                <span className="text-center">{row.confidenceTier ?? '—'}</span>
                <span className={`font-mono ${(row.integrityDelta ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {(row.integrityDelta ?? 0) >= 0 ? '+' : ''}
                  {(row.integrityDelta ?? 0).toFixed(4)}
                </span>
                <span className={`inline-flex w-fit rounded border px-2 py-0.5 text-[10px] ${statusBadge(row.status)}`}>{row.status}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-800 bg-slate-950/70 px-3 py-2 text-right text-slate-300">
            {rows.length} entries · Total GI delta:{' '}
            <span className={totalDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
              {totalDelta >= 0 ? '+' : ''}
              {totalDelta.toFixed(4)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
