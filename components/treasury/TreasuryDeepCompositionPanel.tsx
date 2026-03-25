'use client';

import { useMemo, useState } from 'react';

export type TreasuryDeepCompositionItem = {
  id: string;
  parent: string;
  label: string;
  valuePublic: number;
  valueIntragov: number;
  valueTotal: number;
  shareOfTotal: number;
  canonicalOrder: number;
  timestamp: string;
};

function formatUsd(value: number) {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

function toneForParent(parent: string) {
  if (parent === 'Marketable') return 'bg-sky-400';
  if (parent === 'Nonmarketable') return 'bg-violet-400';
  return 'bg-slate-400';
}

export default function TreasuryDeepCompositionPanel({
  asOf,
  categories,
  canonicalOrder,
}: {
  asOf: string;
  categories: TreasuryDeepCompositionItem[];
  canonicalOrder: string[];
}) {
  const [expanded, setExpanded] = useState(false);

  const grouped = useMemo(() => {
    const bucket = new Map<string, TreasuryDeepCompositionItem[]>();
    for (const item of categories) {
      const arr = bucket.get(item.parent) ?? [];
      arr.push(item);
      bucket.set(item.parent, arr);
    }
    return bucket;
  }, [categories]);

  if (!categories || categories.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-500">
        Treasury deep composition pending
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Monthly Deep Composition</div>
          <div className="mt-1 text-xs text-slate-400">ECHO canonical ordering · as of {asOf}</div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-900">
        <div className="flex h-full w-full">
          {categories.map((item) => (
            <div
              key={item.id}
              className={toneForParent(item.parent)}
              style={{ width: `${Math.max(0, item.shareOfTotal * 100)}%` }}
              title={`${item.label}: ${(item.shareOfTotal * 100).toFixed(1)}%`}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {['Marketable', 'Nonmarketable'].map((parent) => {
          const items = grouped.get(parent) ?? [];
          const total = items.reduce((sum, item) => sum + item.valueTotal, 0);
          return (
            <div key={parent} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white">{parent}</div>
                <div className="text-xs text-slate-400">{formatUsd(total)}</div>
              </div>
              {expanded ? (
                <div className="mt-3 space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-slate-200">{item.label}</div>
                          <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
                            order {item.canonicalOrder} · {new Date(item.timestamp).toISOString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-white">{formatUsd(item.valueTotal)}</div>
                          <div className="mt-1 text-[11px] text-slate-400">{(item.shareOfTotal * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                        <div>Public · {formatUsd(item.valuePublic)}</div>
                        <div>Intragov · {formatUsd(item.valueIntragov)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Canonical Order</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {canonicalOrder.map((item) => (
            <span
              key={item}
              className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-400"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
