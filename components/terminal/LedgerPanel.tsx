'use client';

import { useState, useMemo } from 'react';
import type { LedgerEntry } from '@/lib/terminal/types';
import type { DataSource } from '@/lib/response-envelope';
import { cn } from '@/lib/terminal/utils';
import DataSourceBadge from './DataSourceBadge';
import SectionLabel from './SectionLabel';
import SortBar, { type SortOption } from './SortBar';

const TYPE_STYLES: Record<LedgerEntry['type'], string> = {
  epicon: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  attestation: 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10',
  shard: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  ubi: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  settlement: 'text-slate-300 border-slate-500/30 bg-slate-500/10',
};

const STATUS_STYLES: Record<LedgerEntry['status'], string> = {
  committed: 'text-emerald-300',
  pending: 'text-amber-300',
  reverted: 'text-red-300',
};

type LedgerSortKey = 'time' | 'type' | 'gi_delta' | 'status';

const SORT_OPTIONS: SortOption<LedgerSortKey>[] = [
  { key: 'time', label: 'Time' },
  { key: 'type', label: 'Type' },
  { key: 'gi_delta', label: 'GI Delta' },
  { key: 'status', label: 'Status' },
];

const LEDGER_STATUS_RANK: Record<string, number> = { committed: 2, pending: 1, reverted: 0 };

function sortLedger(entries: LedgerEntry[], key: LedgerSortKey, dir: 'asc' | 'desc'): LedgerEntry[] {
  const mult = dir === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    switch (key) {
      case 'time':
        return mult * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      case 'type':
        return mult * a.type.localeCompare(b.type);
      case 'gi_delta':
        return mult * (a.integrityDelta - b.integrityDelta);
      case 'status':
        return mult * ((LEDGER_STATUS_RANK[a.status] ?? 0) - (LEDGER_STATUS_RANK[b.status] ?? 0));
      default:
        return 0;
    }
  });
}

export default function LedgerPanel({
  entries,
  duplicateSuppressedCount = 0,
  promotionCounters,
  selectedId,
  onSelect,
}: {
  entries: LedgerEntry[];
  duplicateSuppressedCount?: number;
  promotionCounters?: {
    pending_promotable_count: number;
    promoted_this_cycle_count: number;
    committed_agent_count: number;
    failed_promotion_count: number;
    diagnostics?: {
      last_promotion_run_at: string | null;
      promoter_input_count: number;
      promoter_eligible_count: number;
      promoter_excluded_reasons: Record<string, number>;
      promoted_ids_this_cycle: string[];
    };
  };
  selectedId?: string;
  onSelect?: (entry: LedgerEntry) => void;
}) {
  const [sortKey, setSortKey] = useState<LedgerSortKey>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => sortLedger(entries, sortKey, sortDir), [entries, sortKey, sortDir]);
  const liveIngestEntries = useMemo(
    () => sorted.filter((entry) => entry.source === 'echo' && entry.status === 'pending'),
    [sorted],
  );
  const liveCommittedEntries = useMemo(
    () => sorted.filter((entry) => (entry.source === 'echo' || entry.source === 'eve-synthesis' || entry.source === 'agent_commit') && entry.status === 'committed'),
    [sorted],
  );
  const backfillEntries = useMemo(
    () => sorted.filter((entry) => entry.source === 'backfill' || entry.source === 'mock'),
    [sorted],
  );
  const cycleId = liveIngestEntries[0]?.cycleId ?? liveCommittedEntries[0]?.cycleId ?? sorted[0]?.cycleId ?? 'unknown';
  const source = useMemo<DataSource>(() => {
    if (entries.some((entry) => entry.source === 'echo')) return 'live';
    if (entries.some((entry) => entry.source === 'eve-synthesis')) return 'live';
    if (entries.some((entry) => entry.source === 'backfill')) return 'stale-cache';
    return 'mock';
  }, [entries]);
  const freshAt = sorted[0]?.timestamp ?? null;
  const degraded = source !== 'live';

  return (
    <section
      className={cn(
        'rounded-xl border bg-slate-900/60 p-4',
        degraded ? 'border-amber-500/40' : 'border-slate-800'
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 flex-wrap">
          <SectionLabel
            title="Civic Ledger"
            subtitle="Immutable event record — Mobius Substrate"
          />
          <DataSourceBadge source={source} freshAt={freshAt} degraded={degraded} />
        </div>
        <SortBar
          options={SORT_OPTIONS}
          active={sortKey}
          direction={sortDir}
          onSort={(k, d) => { setSortKey(k); setSortDir(d); }}
        />
      </div>
      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[11px] font-mono uppercase tracking-[0.1em] text-slate-300">
          <div>live_ingest_count: <span className="text-amber-300">{liveIngestEntries.length}</span></div>
          <div>live_committed_agent_count: <span className="text-emerald-300">{liveCommittedEntries.length}</span></div>
          <div>backfill_count: <span className="text-slate-200">{backfillEntries.length}</span></div>
          <div>duplicate_suppressed_count: <span className="text-fuchsia-300">{duplicateSuppressedCount}</span></div>
          <div>pending_promotable_count: <span className="text-amber-300">{promotionCounters?.pending_promotable_count ?? 0}</span></div>
          <div>promoted_this_cycle_count: <span className="text-sky-300">{promotionCounters?.promoted_this_cycle_count ?? 0}</span></div>
          <div>committed_agent_count: <span className="text-emerald-300">{promotionCounters?.committed_agent_count ?? liveCommittedEntries.length}</span></div>
          <div>failed_promotion_count: <span className="text-rose-300">{promotionCounters?.failed_promotion_count ?? 0}</span></div>
          <div>promoter_input_count: <span className="text-slate-200">{promotionCounters?.diagnostics?.promoter_input_count ?? 0}</span></div>
          <div>promoter_eligible_count: <span className="text-sky-300">{promotionCounters?.diagnostics?.promoter_eligible_count ?? 0}</span></div>
          <div className="col-span-2">
            promoted_ids_this_cycle: <span className="text-emerald-300">{promotionCounters?.diagnostics?.promoted_ids_this_cycle?.join(', ') || 'none'}</span>
          </div>
          <div className="col-span-2">
            last_promotion_run_at: <span className="text-slate-200">{promotionCounters?.diagnostics?.last_promotion_run_at ?? 'n/a'}</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[10px] font-mono uppercase tracking-[0.08em] text-slate-400">
          promoter_excluded_reasons: {Object.entries(promotionCounters?.diagnostics?.promoter_excluded_reasons ?? {})
            .map(([reason, count]) => `${reason}=${count}`)
            .join(' · ') || 'none'}
        </div>
        <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-slate-500">
          Cycle {cycleId} · default focus: committed agent memory
        </div>
      </div>

      <div className="mt-3 space-y-4">
        {liveCommittedEntries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onSelect?.(entry)}
            className={cn(
              'cv-auto w-full rounded-lg border p-3 text-left transition',
              selectedId === entry.id
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">
                    {entry.id}
                  </span>
                  <span
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em]',
                      TYPE_STYLES[entry.type],
                    )}
                  >
                    {entry.type}
                  </span>
                  {entry.category && (
                    <span className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-300">
                      {entry.category}
                    </span>
                  )}
                  {typeof entry.confidenceTier === 'number' && (
                    <span className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-amber-300">
                      Tier {entry.confidenceTier}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-sm font-semibold text-slate-100">
                  <span>{entry.title ?? entry.summary}</span>
                  {entry.source === 'eve-synthesis' ? (
                    <span className="text-[10px] font-mono text-rose-400 border border-rose-400/30 rounded px-1 py-0.5 ml-1">
                      EVE SYN
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-sm font-sans text-slate-400">
                  {entry.summary}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[10px] font-mono text-slate-500">
                  {entry.timestamp}
                </div>
                <div className={cn('mt-1 text-[10px] font-mono uppercase', STATUS_STYLES[entry.status])}>
                  {entry.status}
                </div>
                {entry.integrityDelta !== 0 && (
                  <div
                    className={cn(
                      'mt-1 text-[10px] font-mono',
                      entry.integrityDelta > 0 ? 'text-emerald-300' : 'text-red-300',
                    )}
                  >
                    {entry.integrityDelta > 0 ? '+' : ''}
                    {entry.integrityDelta.toFixed(3)} GI
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-300">
                {entry.agentOrigin}
              </span>
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-300">
                {entry.cycleId}
              </span>
              {entry.source && (
                <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-400">
                  {entry.source}
                </span>
              )}
            </div>
          </button>
        ))}
        {liveCommittedEntries.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
            No live committed agent records in the active cycle yet.
          </div>
        ) : null}

        {liveIngestEntries.length > 0 ? (
          <details className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
            <summary className="cursor-pointer text-xs font-mono uppercase tracking-[0.1em] text-amber-300">
              Live ingest (pending) · {liveIngestEntries.length}
            </summary>
            <div className="mt-2 space-y-2">
              {liveIngestEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onSelect?.(entry)}
                  className={cn(
                    'cv-auto w-full rounded-lg border p-3 text-left transition border-amber-500/20 bg-slate-950/60 hover:border-amber-400/40',
                    selectedId === entry.id && 'border-amber-400/60 bg-amber-500/10',
                  )}
                >
                  <div className="text-xs font-mono text-slate-400">{entry.id}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{entry.title ?? entry.summary}</div>
                </button>
              ))}
            </div>
          </details>
        ) : null}

        {backfillEntries.length > 0 ? (
          <details className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
            <summary className="cursor-pointer text-xs font-mono uppercase tracking-[0.1em] text-slate-400">
              Historical backfill · {backfillEntries.length}
            </summary>
          </details>
        ) : null}
      </div>
      {degraded ? (
        <div className="mt-3 text-xs text-amber-300">
          Showing mock/cached data — live source offline
        </div>
      ) : null}
    </section>
  );
}
