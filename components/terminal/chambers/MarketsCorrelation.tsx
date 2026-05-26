'use client';

import { gatedConfidence } from '@/lib/terminal/markets';
import type { MarketSignal } from '@/lib/terminal/markets';

const GI_HISTORY = [
  { cycle: 'C-316', gi: 0.82 },
  { cycle: 'C-317', gi: 0.79 },
  { cycle: 'C-318', gi: 0.64 },
  { cycle: 'C-319', gi: 0.70 },
  { cycle: 'C-320', gi: 0.66 },
  { cycle: 'C-321', gi: 0.91 },
  { cycle: 'C-322', gi: 0.80 },
  { cycle: 'C-323', gi: 0.75 },
] as const;

const CHART_H = 80;

interface Props {
  signals: MarketSignal[];
  gi: number | null;
}

export function MarketsCorrelation({ signals, gi }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 font-mono text-xs">
      {/* GI trend */}
      <div>
        <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-2">
          GI Trend · Last 8 Cycles
        </div>
        <div className="flex items-end gap-1" style={{ height: `${CHART_H}px` }}>
          {GI_HISTORY.map(({ cycle, gi: g }) => {
            const h = Math.round((g / 1.0) * CHART_H);
            const color =
              g >= 0.80 ? 'bg-green-500' :
              g >= 0.65 ? 'bg-amber-500' :
              'bg-red-500';
            return (
              <div key={cycle} className="flex flex-col items-center gap-0.5 flex-1 group">
                <div
                  className={`w-full rounded-sm ${color} opacity-70 group-hover:opacity-100 transition-opacity`}
                  style={{ height: `${h}px` }}
                  title={`${cycle}: GI ${g}`}
                />
                <span className="text-zinc-700 text-[8px]">{cycle.replace('C-', '')}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Integrity weight matrix */}
      <div>
        <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-2">
          Integrity Weight by Signal
        </div>
        <div className="space-y-3">
          {signals.map((sig) => {
            const gated = gatedConfidence(sig, gi);
            const rawPct = Math.round(sig.confidence * 100);
            const gatedPct = Math.round(gated * 100);
            const drop = rawPct - gatedPct;
            const barColor =
              gatedPct >= 80 ? 'bg-green-500' :
              gatedPct >= 60 ? 'bg-amber-500' :
              'bg-red-500';
            return (
              <div key={sig.id}>
                <div className="flex justify-between mb-1">
                  <span className="text-zinc-400 truncate mr-2">{sig.label}</span>
                  <span className="flex-shrink-0 text-zinc-500">
                    {rawPct}% →{' '}
                    <span className={drop > 5 ? 'text-amber-400' : 'text-green-400'}>{gatedPct}%</span>
                    {drop > 5 && <span className="text-red-500 ml-1">↓{drop}pp</span>}
                  </span>
                </div>
                <div className="bg-zinc-800 rounded-full h-1">
                  <div
                    className={`h-1 rounded-full ${barColor} transition-all`}
                    style={{ width: `${gatedPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
