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

function statusBadge(status: string) {
  if (status === 'committed') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (status === 'flagged') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
}

export default function LedgerPageClient() {
  const [feed, setFeed] = useState<EchoFeedResponse | null>(null);

  useEffect(() => {
    fetch('/api/echo/feed', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setFeed(json as EchoFeedResponse))
      .catch(() => setFeed({ ledger: [] }));
  }, []);

  const rows = useMemo(() => feed?.ledger ?? [], [feed]);
  const totalDelta = useMemo(() => rows.reduce((sum, row) => sum + (row.integrityDelta ?? 0), 0), [rows]);

  if (!feed) return <ChamberSkeleton blocks={10} />;

  return (
    <div className="h-full overflow-y-auto p-4 text-xs">
      <div className="mb-3 text-slate-400">
        {feed.status?.cycleId ?? 'C-—'} · {rows.length} ledger rows
      </div>
      {rows.length === 0 ? (
        <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-slate-400">
          No ledger rows available yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-800">
          <div className="grid grid-cols-[120px_1fr_110px_110px_120px_110px] bg-slate-950/80 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
            <span>Timestamp</span>
            <span>Title</span>
            <span>Category</span>
            <span>Tier</span>
            <span>Integrity Δ</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-slate-800 bg-slate-900/50">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[120px_1fr_110px_110px_120px_110px] items-center gap-2 px-3 py-2 text-slate-200">
                <span className="font-mono text-[11px] text-slate-400">{row.timestamp.slice(11, 19)}Z</span>
                <span className="truncate" title={`${row.id} · ${row.title ?? row.summary}`}>
                  <span className="mr-2 font-mono text-slate-400">{row.id}</span>
                  {row.title ?? row.summary}
                </span>
                <span>{row.category ?? '—'}</span>
                <span>{row.confidenceTier ?? '—'}</span>
                <span className={row.integrityDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {row.integrityDelta >= 0 ? '+' : ''}
                  {row.integrityDelta.toFixed(4)}
                </span>
                <span className={`inline-flex w-fit rounded border px-2 py-0.5 ${statusBadge(row.status)}`}>{row.status}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-800 bg-slate-950/70 px-3 py-2 text-right text-slate-300">
            Total GI delta:{' '}
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
