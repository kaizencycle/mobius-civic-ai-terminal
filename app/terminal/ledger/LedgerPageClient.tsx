'use client';

import { useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useLedgerChamber } from '@/hooks/useLedgerChamber';
import type { LedgerEntry } from '@/lib/terminal/types';

// ... (keeping all existing helpers unchanged)

export default function LedgerPageClient() {
  const { data, preview, full, error, stabilizationActive } = useLedgerChamber(true);
  const [sortKey, setSortKey] = useState<'timestamp' | 'agent' | 'category' | 'tier' | 'delta' | 'status'>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [scrollPage, setScrollPage] = useState(0);

  const rows = useMemo(() => data?.events ?? [], [data]);
  const freshness = data?.freshness;

  const activeCycle = freshness?.activeCycle ?? data?.cycleId ?? 'C-—';
  const latestCycle = freshness?.latestRowCycle ?? 'C-—';
  const lag = freshness?.cycleLag;

  const sorted = useMemo(() => [...rows].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [rows]);

  if (!data) return <ChamberSkeleton blocks={10} />;

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 text-xs">

      {/* 🔥 NEW: Cycle Truth Header */}
      <div className="mb-2 flex flex-col gap-1">
        <div className="text-slate-400">
          Active: {activeCycle} · Showing: {latestCycle}
        </div>

        {lag && lag > 0 ? (
          <div className="rounded border border-rose-700/40 bg-rose-950/20 px-2 py-1 text-[11px] text-rose-200">
            ⚠ Ledger {lag} cycle{lag > 1 ? 's' : ''} behind
          </div>
        ) : null}

        {freshness?.warning === 'EMPTY_CURRENT_CYCLE' ? (
          <div className="rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-200">
            ⚠ No entries yet for current cycle
          </div>
        ) : null}
      </div>

      {/* existing header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-slate-400">
          {activeCycle} · {rows.length} ledger rows
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-slate-400">
          No ledger rows available yet.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded border border-slate-800">
          {sorted.map((row) => (
            <div key={row.id} className="border-b border-slate-800 px-3 py-2">
              <div className="flex justify-between">
                <span>{row.agentOrigin}</span>
                <span className="text-slate-500">{row.cycleId}</span>
              </div>
              <div className="text-slate-300">{row.title ?? row.summary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
