'use client';

import { useEffect, useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import ChamberEmptyState from '@/components/terminal/ChamberEmptyState';

type LedgerEntry = {
  id: string;
  cycleId?: string;
  type?: string;
  agentOrigin?: string;
  timestamp: string;
  title?: string;
  summary?: string;
  integrityDelta?: number;
  status?: 'committed' | 'pending' | 'reverted' | string;
  category?: string;
  confidenceTier?: number;
  tags?: string[];
  source?: string;
};

type EchoFeedResponse = {
  ledger?: LedgerEntry[];
  status?: { cycleId?: string; lastIngest?: string };
};

function statusBadge(status: string | undefined): string {
  if (status === 'committed') return 'bg-emerald-900/50 text-emerald-300 border-emerald-700';
  if (status === 'reverted') return 'bg-rose-900/50 text-rose-300 border-rose-700';
  return 'bg-amber-900/50 text-amber-300 border-amber-700';
}

function deltaColor(delta: number | undefined): string {
  if (delta === undefined || delta === null) return 'text-slate-400';
  if (delta > 0) return 'text-emerald-400';
  if (delta < 0) return 'text-rose-400';
  return 'text-slate-400';
}

function formatDelta(delta: number | undefined): string {
  if (delta === undefined || delta === null) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(4)}`;
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return ts.slice(11, 19) || ts;
  }
}

export default function LedgerPageClient() {
  const [feed, setFeed] = useState<EchoFeedResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/echo/feed', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setFeed(json as EchoFeedResponse))
      .catch(() => setFeed({ ledger: [] }));
  }, []);

  const entries = useMemo(() => feed?.ledger ?? [], [feed]);
  const cycleId = feed?.status?.cycleId ?? '—';
  const filtered = useMemo(
    () => (statusFilter === 'ALL' ? entries : entries.filter((e) => (e.status ?? 'pending') === statusFilter)),
    [entries, statusFilter],
  );
  const totalDelta = useMemo(
    () => filtered.reduce((sum, e) => sum + (e.integrityDelta ?? 0), 0),
    [filtered],
  );

  if (!feed) return <ChamberSkeleton blocks={10} />;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between rounded border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
        <span>ECHO Ledger · Cycle {cycleId}</span>
        <span className={`font-mono font-semibold ${deltaColor(totalDelta)}`}>
          ΔGI {formatDelta(totalDelta)}
        </span>
      </div>

      {entries.length === 0 ? (
        <ChamberEmptyState
          title="No ledger entries yet"
          reason="ECHO has not ingested events for this cycle yet."
          action="Trigger /api/echo/ingest or wait for the next scheduled run."
          actionDetail="Ledger entries appear after the first successful EPICON rating cycle."
        />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-slate-400">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
            >
              {['ALL', 'committed', 'pending', 'reverted'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="text-slate-500">{filtered.length} of {entries.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="pb-2 pr-3">Time</th>
                  <th className="pb-2 pr-3">Title</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3">Tier</th>
                  <th className="pb-2 pr-3 text-right">ΔGI</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 font-mono text-slate-400">{formatTs(entry.timestamp)}</td>
                    <td className="py-2 pr-3 text-slate-200" title={entry.summary ?? ''}>
                      {(entry.title ?? entry.summary ?? entry.id).slice(0, 60)}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">{entry.category ?? '—'}</td>
                    <td className="py-2 pr-3 text-center text-slate-400">{entry.confidenceTier ?? '—'}</td>
                    <td className={`py-2 pr-3 text-right font-mono font-semibold ${deltaColor(entry.integrityDelta)}`}>
                      {formatDelta(entry.integrityDelta)}
                    </td>
                    <td className="py-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${statusBadge(entry.status)}`}>
                        {entry.status ?? 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end border-t border-slate-800 pt-3 text-xs">
            <span className="text-slate-500 mr-2">Total ΔGI across {filtered.length} entries:</span>
            <span className={`font-mono font-bold ${deltaColor(totalDelta)}`}>{formatDelta(totalDelta)}</span>
          </div>
        </>
      )}
    </div>
  );
}
