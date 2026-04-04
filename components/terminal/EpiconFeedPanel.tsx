'use client';

import { useState, useMemo } from 'react';
import type { EpiconItem } from '@/lib/terminal/types';
import { confidenceLabel, epiconStatusStyle, cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';
import SortBar, { type SortOption } from './SortBar';

type EpiconSortKey = 'time' | 'confidence' | 'category' | 'status';

const SORT_OPTIONS: SortOption<EpiconSortKey>[] = [
  { key: 'time', label: 'Time' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'category', label: 'Category' },
  { key: 'status', label: 'Status' },
];

const STATUS_RANK: Record<string, number> = { verified: 2, pending: 1, contradicted: 0 };

function sortEpicon(items: EpiconItem[], key: EpiconSortKey, dir: 'asc' | 'desc'): EpiconItem[] {
  const mult = dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    switch (key) {
      case 'time':
        return mult * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      case 'confidence':
        return mult * (a.confidenceTier - b.confidenceTier);
      case 'category':
        return mult * a.category.localeCompare(b.category);
      case 'status':
        return mult * ((STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0));
      default:
        return 0;
    }
  });
}

export default function EpiconFeedPanel({
  items,
  selectedId,
  onSelect,
  noiseThreshold,
}: {
  items: EpiconItem[];
  selectedId: string;
  onSelect: (item: EpiconItem) => void;
  noiseThreshold?: number;
}) {
  const [sortKey, setSortKey] = useState<EpiconSortKey>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => sortEpicon(items, sortKey, sortDir), [items, sortKey, sortDir]);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectionLabel title="EPICON Feed" subtitle="Live audited event stream" />
        <SortBar
          options={SORT_OPTIONS}
          active={sortKey}
          direction={sortDir}
          onSort={(k, d) => { setSortKey(k); setSortDir(d); }}
        />
      </div>
      <div className="mt-3 space-y-3">
        {sorted.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-4 text-sm font-sans text-slate-400">
            No EPICON events are active in this chamber yet. Use <span className="font-mono text-sky-300">/submit</span> to open a new event or switch back to Pulse for the full live feed.
          </div>
        )}
        {sorted.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={cn(
              'cv-auto w-full rounded-lg border p-4 text-left transition',
              selectedId === item.id
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-mono font-medium uppercase tracking-[0.2em] text-slate-400">
                  {item.id}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-sm font-semibold text-white">
                  <span>{item.title}</span>
                  {item.feedSource === 'eve-synthesis' || item.agentOrigin === 'EVE' ? (
                    <span className="text-[10px] font-mono text-fuchsia-300 border border-fuchsia-400/35 rounded px-1 py-0.5 ml-1">
                      EVE
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm font-sans text-slate-300">
                  {item.summary}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <span
                  className={cn(
                    'rounded-md border px-2 py-1 text-[10px] font-mono font-medium uppercase tracking-[0.15em]',
                    epiconStatusStyle(item.status),
                  )}
                >
                  {item.status}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {item.timestamp}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-300">
                {item.category}
              </span>
              <span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-300">
                {confidenceLabel(item.confidenceTier)}
              </span>
              <span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-300">
                {item.ownerAgent}
              </span>
              {typeof noiseThreshold === 'number' && item.confidenceTier / 4 < noiseThreshold && (
                <span className="rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-orange-300">
                  C-261 Breach Risk
                </span>
              )}
              {item.id.includes('-USR-') && (
                <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-violet-300">
                  participant
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
