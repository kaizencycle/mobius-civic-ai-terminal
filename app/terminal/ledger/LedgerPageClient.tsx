'use client';

import { useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useLedgerChamber } from '@/hooks/useLedgerChamber';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { LedgerEntry } from '@/lib/terminal/types';
import AgentLedgerAdapterPanel from './AgentLedgerAdapterPanel';

type EchoFeedResponse = {
  events?: LedgerEntry[];
  status?: {
    cycleId?: string;
  };
};

type SortKey = 'timestamp' | 'agent' | 'category' | 'tier' | 'delta' | 'status';
type SortDir = 'asc' | 'desc';

const DEFAULT_LEDGER_PAGE_SIZE = 100;
const DEFAULT_LEDGER_PAGES = 3;

function statusBadge(status: string) {
  if (status === 'committed') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (status === 'flagged') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
}

function canonBadge(canonState: LedgerEntry['canonState']) {
  if (canonState === 'sealed' || canonState === 'attested') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200';
  if (canonState === 'candidate') return 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200';
  if (canonState === 'blocked') return 'border-rose-500/35 bg-rose-500/10 text-rose-200';
  return 'border-slate-700 bg-slate-900/60 text-slate-400';
}

function agentColor(agent: string): string {
  const a = agent.toUpperCase();
  if (a === 'ATLAS') return 'text-cyan-400';
  if (a === 'ZEUS') return 'text-yellow-400';
  if (a === 'HERMES') return 'text-rose-400';
  if (a === 'AUREA') return 'text-amber-400';
  if (a === 'JADE') return 'text-emerald-400';
  if (a === 'DAEDALUS') return 'text-violet-400';
  if (a === 'ECHO') return 'text-slate-300';
  if (a === 'EVE') return 'text-rose-300';
  return 'text-cyan-400/80';
}

function relTime(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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
  const { data, preview, full, error, stabilizationActive } = useLedgerChamber(true);
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [scrollPage, setScrollPage] = useState(0);
  const feed = useMemo(() => (data ? ({ events: data.events, status: { cycleId: data.cycleId ?? data.events[0]?.cycleId ?? 'C-—' } } as EchoFeedResponse) : null), [data]);
  const rows = useMemo(() => feed?.events ?? [], [feed]);
  const pageSize = data?.pagination?.pageSize ?? DEFAULT_LEDGER_PAGE_SIZE;
  const maxPages = data?.pagination?.pages ?? DEFAULT_LEDGER_PAGES;
  const deterministicCycle = currentCycleId();
  const freshness = data?.freshness;
  const activeCycle = freshness?.activeCycle ?? deterministicCycle;
  const latestRowCycle = freshness?.latestRowCycle ?? feed?.status?.cycleId ?? rows[0]?.cycleId ?? 'C-—';
  const cycleLag = freshness?.cycleLag ?? null;
  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const pageCount = Math.max(1, Math.min(maxPages, Math.ceil(sorted.length / pageSize)));
  const safePage = Math.min(scrollPage, pageCount - 1);
  const visibleRows = useMemo(() => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize), [sorted, safePage, pageSize]);
  const totalDelta = useMemo(() => rows.reduce((sum, row) => sum + (row.integrityDelta ?? 0), 0), [rows]);
  const canon = data?.canon;
  const pendingRows = data?.candidates.pending ?? rows.filter((row) => row.status === 'pending').length;
  const committedRows = data?.candidates.confirmed ?? rows.filter((row) => row.status === 'committed').length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setScrollPage(0);
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  if (!feed) return <ChamberSkeleton blocks={10} />;

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 text-xs">
      <div className="mb-3 rounded border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Active cycle <span className="text-cyan-200">{activeCycle}</span> · latest ledger row <span className={cycleLag && cycleLag > 0 ? 'text-rose-200' : 'text-emerald-200'}>{latestRowCycle}</span>
          </span>
          <span className="text-slate-500">
            current rows {freshness?.currentCycleRows ?? rows.filter((row) => row.cycleId === activeCycle).length} · stale rows {freshness?.staleRows ?? rows.filter((row) => row.cycleId !== activeCycle).length}
          </span>
        </div>
        {cycleLag && cycleLag > 0 ? (
          <div className="mt-2 rounded border border-rose-700/40 bg-rose-950/20 px-2 py-1 text-rose-200">
            ⚠ Ledger freshness lag: showing rows up to {latestRowCycle}, {cycleLag} cycle{cycleLag > 1 ? 's' : ''} behind {activeCycle}.
          </div>
        ) : null}
        {freshness?.warning === 'EMPTY_CURRENT_CYCLE' ? (
          <div className="mt-2 rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-amber-200">
            ⚠ No entries yet for the active cycle. This is honest empty state, not a live-data failure.
          </div>
        ) : null}
        {freshness?.warning === 'UNKNOWN_CYCLE_ROWS' ? (
          <div className="mt-2 rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-amber-200">
            ⚠ Some ledger rows have unknown cycle metadata and cannot be aligned safely.
          </div>
        ) : null}
      </div>

      <AgentLedgerAdapterPanel activeCycle={activeCycle} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-slate-400">
          {activeCycle} · {rows.length} ledger rows
        </span>
        {preview && !full ? (
          <span className="rounded border border-cyan-700/40 bg-cyan-950/20 px-2 py-1 text-[10px] text-cyan-200">preview</span>
        ) : null}
        <div className="flex gap-1">
          {(['timestamp', 'agent', 'delta', 'status'] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggleSort(k)}
              className={`rounded border px-1.5 py-0.5 text-[9px] font-mono ${sortKey === k ? 'border-cyan-600/50 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 text-slate-500'}`}
            >
              {k}{arrow(k)}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5 text-[10px] font-mono uppercase tracking-[0.08em] text-slate-400">
        <span className="rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-amber-200">pending {pendingRows}</span>
        <span className="rounded border border-emerald-700/40 bg-emerald-950/20 px-2 py-1 text-emerald-200">committed {committedRows}</span>
        <span className="rounded border border-cyan-700/40 bg-cyan-950/20 px-2 py-1 text-cyan-200">max {data?.pagination?.maxRows ?? 300}</span>
        {canon ? (
          <>
            <span className="rounded border border-slate-700 bg-slate-950/50 px-2 py-1">hot {canon.hot}</span>
            <span className="rounded border border-cyan-700/40 bg-cyan-950/20 px-2 py-1 text-cyan-200">candidate {canon.candidate}</span>
            <span className="rounded border border-emerald-700/40 bg-emerald-950/20 px-2 py-1 text-emerald-200">attested {canon.attested + canon.sealed}</span>
            <span className="rounded border border-rose-700/40 bg-rose-950/20 px-2 py-1 text-rose-200">blocked {canon.blocked}</span>
          </>
        ) : null}
      </div>
      {pageCount > 1 ? (
        <div className="mb-3 flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-[10px] text-slate-400">
          <span className="font-mono uppercase tracking-[0.12em]">Scroll page {safePage + 1}/{pageCount}</span>
          <div className="flex gap-1">
            {Array.from({ length: pageCount }, (_, page) => (
              <button
                key={page}
                type="button"
                onClick={() => setScrollPage(page)}
                className={`rounded border px-2 py-0.5 font-mono ${safePage === page ? 'border-cyan-600/60 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 text-slate-500'}`}
              >
                {page + 1}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <div className="mb-2 rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-200">Ledger chamber degraded · showing snapshot preview</div> : null}
      {(data as { degraded?: boolean; ledgerError?: string } | null)?.ledgerError === 'ledger_circuit_open' ? (
        <div className="mb-2 rounded border border-rose-700/50 bg-rose-950/20 px-3 py-2 text-[11px] text-rose-200">
          <span className="font-semibold">LEDGER CIRCUIT OPEN</span>
          {' · '}Ledger API returned 503 — promotion pipeline paused. Run{' '}
          <code className="rounded bg-slate-900 px-1 text-[10px] text-rose-300">POST /api/epicon/promote</code>
          {' '}to reset, or check Render/Render KV health.
        </div>
      ) : null}
      {stabilizationActive ? <div className="mb-2 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-100">⚠ Predictive Stabilization Active · Preview state prioritized due to integrity drift</div> : null}
      {rows.length === 0 ? (
        <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-slate-400">
          No ledger rows available yet.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-800">
          <div className="hidden md:grid grid-cols-[90px_70px_1fr_90px_50px_80px_70px] bg-slate-950/80 px-3 py-2 text-[10px] uppercase tracking-wide text-slate-400">
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
              T{arrow('tier')}
            </button>
            <button type="button" onClick={() => toggleSort('delta')} className="text-left hover:text-slate-200">
              GI Δ{arrow('delta')}
            </button>
            <button type="button" onClick={() => toggleSort('status')} className="text-left hover:text-slate-200">
              Status{arrow('status')}
            </button>
          </div>

          <div className="min-h-0 flex-1 divide-y divide-slate-800 overflow-y-auto bg-slate-900/50">
            {visibleRows.map((row) => {
              const delta = row.integrityDelta ?? 0;
              const hasDelta = Math.abs(delta) > 0.0001;
              return (
                <div key={row.id}>
                  <div className="hidden md:grid grid-cols-[90px_70px_1fr_90px_50px_80px_70px] items-center gap-1 px-3 py-1.5 text-slate-200">
                    <span className="font-mono text-[10px] text-slate-500">{row.timestamp.slice(11, 19)}Z</span>
                    <span className={`truncate font-mono text-[10px] ${agentColor(row.agentOrigin)}`} title={row.agentOrigin}>
                      {row.agentOrigin}
                    </span>
                    <span className="truncate text-[11px]" title={row.title ?? row.summary}>
                      {row.title ?? row.summary}
                    </span>
                    <span className="text-[9px] text-slate-500">{row.category ?? '—'}</span>
                    <span className="text-center text-[10px] text-slate-500">{row.confidenceTier ?? '—'}</span>
                    <span className={`font-mono text-[10px] ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {hasDelta ? `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}` : '—'}
                    </span>
                    <span className={`inline-flex w-fit rounded border px-1.5 py-0.5 text-[9px] ${statusBadge(row.status)}`}>{row.status}</span>
                  </div>
                  <div className="md:hidden px-3 py-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono text-[11px] font-semibold ${agentColor(row.agentOrigin)}`}>
                        {row.agentOrigin}
                      </span>
                      <div className="flex items-center gap-2">
                        {hasDelta ? (
                          <span className={`font-mono text-[10px] ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(4)}
                          </span>
                        ) : null}
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] ${canonBadge(row.canonState)}`}>{row.canonState ?? 'hot'}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] ${statusBadge(row.status)}`}>{row.status}</span>
                      </div>
                    </div>
                    <div className="text-[11px] leading-snug text-slate-200">{row.title ?? row.summary}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-slate-500">
                      <span className="font-mono">{row.timestamp.slice(11, 19)}Z</span>
                      <span>{relTime(row.timestamp)}</span>
                      {row.category ? <span>{row.category}</span> : null}
                      {row.confidenceTier != null ? <span>T{row.confidenceTier}</span> : null}
                    </div>
                    <div className="text-[9px] text-slate-600">
                      {row.statusReason ?? 'status pending'} · proof {row.proofSource ?? 'none'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-800 bg-slate-950/70 px-3 py-2 text-right text-[11px] text-slate-300">
            Showing {safePage * pageSize + 1}-{Math.min(safePage * pageSize + visibleRows.length, rows.length)} of {rows.length} entries · GI Δ{' '}
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
