'use client';

export type TreasuryCompositionItem = {
  id: string;
  label: string;
  value: number;
  share: number;
  canonicalOrder: number;
  timestamp: string;
};

function formatUsd(value: number) {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

function barTone(order: number) {
  if (order === 1) return 'bg-sky-400';
  if (order === 2) return 'bg-violet-400';
  return 'bg-slate-400';
}

export default function TreasuryCompositionPanel({
  asOf,
  categories,
}: {
  asOf: string;
  categories: TreasuryCompositionItem[];
}) {
  if (!categories || categories.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-500">
        Treasury composition pending
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Canonical Composition</div>
        <div className="text-[11px] font-mono text-slate-400">as of {asOf}</div>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-900">
        <div className="flex h-full w-full">
          {categories.map((item) => (
            <div
              key={item.id}
              className={barTone(item.canonicalOrder)}
              style={{ width: `${Math.max(0, item.share * 100)}%` }}
              title={`${item.label}: ${(item.share * 100).toFixed(1)}%`}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {categories.map((item) => (
          <div key={item.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-white">{item.label}</div>
                <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
                  order {item.canonicalOrder} · {new Date(item.timestamp).toISOString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-white">{formatUsd(item.value)}</div>
                <div className="mt-1 text-[11px] text-slate-400">{(item.share * 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
