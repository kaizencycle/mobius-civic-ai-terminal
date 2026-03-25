'use client';

import type { TreasuryCrossCheckLine } from '@/lib/treasury/cross-check';

function formatUsd(value: number) {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

function statusTone(status: 'aligned' | 'watch' | 'drift' | 'partial') {
  if (status === 'aligned') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'watch') return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  if (status === 'partial') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
}

function lineTone(status: 'aligned' | 'drift' | 'missing') {
  if (status === 'aligned') return 'text-emerald-300';
  if (status === 'missing') return 'text-amber-300';
  return 'text-rose-300';
}

export default function TreasuryCrossCheckPanel({
  asOf,
  status,
  summary,
  lines,
}: {
  asOf: string;
  status: 'aligned' | 'watch' | 'drift' | 'partial';
  summary: {
    mspdTotal: number;
    schedulesTotal: number;
    absDiff: number;
    pctDiff: number;
  };
  lines: TreasuryCrossCheckLine[];
}) {
  if (!lines || lines.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-500">
        Treasury cross-check pending
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">MSPD × Schedules Cross-Check</div>
          <div className="mt-1 text-xs text-slate-400">Canonical holder/type comparison · as of {asOf}</div>
        </div>
        <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusTone(status)}`}>
          {status}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">MSPD</div>
          <div className="mt-1 text-sm text-white">{formatUsd(summary.mspdTotal)}</div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Schedules</div>
          <div className="mt-1 text-sm text-white">{formatUsd(summary.schedulesTotal)}</div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Abs Diff</div>
          <div className="mt-1 text-sm text-white">{formatUsd(summary.absDiff)}</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-white">{line.label}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{line.parent}</div>
              </div>
              <div className={`text-xs uppercase tracking-[0.12em] ${lineTone(line.status)}`}>{line.status}</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
              <div>MSPD · {formatUsd(line.mspdTotal)}</div>
              <div>Schedules · {formatUsd(line.schedulesTotal)}</div>
              <div>Δ · {formatUsd(line.absDiff)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
