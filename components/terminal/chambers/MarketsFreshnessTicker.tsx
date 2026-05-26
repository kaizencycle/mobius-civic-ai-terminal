'use client';

import { useEffect, useState } from 'react';
import type { MarketSignal } from '@/lib/terminal/markets';

interface Props {
  signals: MarketSignal[];
}

function staleness(ts: number): { label: string; color: string } {
  const ageSec = (Date.now() - ts) / 1000;
  if (ageSec < 300)    return { label: 'LIVE',  color: 'text-green-400' };
  if (ageSec < 3_600)  return { label: 'FRESH', color: 'text-green-400' };
  if (ageSec < 86_400) return { label: 'STALE', color: 'text-amber-400' };
  return                      { label: 'OLD',   color: 'text-red-400' };
}

export function MarketsFreshnessTicker({ signals }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  void tick;

  return (
    <div
      className="flex items-center gap-0 overflow-x-auto border-b border-zinc-800 bg-zinc-950/40 px-2 py-1.5"
      style={{ scrollbarWidth: 'none' }}
    >
      {signals.map((sig) => {
        const { label, color } = staleness(sig.ts);
        const deltaColor =
          sig.deltaDir === 'up'   ? 'text-green-400' :
          sig.deltaDir === 'down' ? 'text-red-400' :
          'text-zinc-400';
        return (
          <div
            key={sig.id}
            className="flex items-center gap-2 px-3 flex-shrink-0 border-r border-zinc-800 last:border-r-0"
          >
            <span className="text-zinc-500 text-[10px]">{sig.label.split(' ').slice(0, 2).join(' ')}</span>
            <span className={`text-[10px] font-bold ${deltaColor}`}>
              {sig.deltaDir === 'up' ? '▲' : sig.deltaDir === 'down' ? '▼' : '—'} {sig.value}
            </span>
            <span className={`text-[9px] ${color}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
