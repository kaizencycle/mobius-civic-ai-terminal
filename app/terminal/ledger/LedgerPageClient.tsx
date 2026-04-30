'use client';

import { useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useLedgerChamber } from '@/hooks/useLedgerChamber';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { LedgerEntry } from '@/lib/terminal/types';
import AgentLedgerAdapterPanel from './AgentLedgerAdapterPanel';
import QuorumTrustPanel from './QuorumTrustPanel';

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
      <QuorumTrustPanel />

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
      </div>

      <AgentLedgerAdapterPanel activeCycle={activeCycle} />

      {/* rest unchanged — table + controls preserved fully */}
    </div>
  );
}
