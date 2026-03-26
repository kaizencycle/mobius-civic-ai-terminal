'use client';

import { useEffect, useState } from 'react';
import type { MarketSweepExportPayload } from '@/lib/markets/market-sweep-export';

function tone(status: MarketSweepExportPayload['status']) {
  if (status === 'risk-off') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (status === 'elevated') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'watch') return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
}

export default function MarketSweepExportCard() {
  const [data, setData] = useState<MarketSweepExportPayload | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch('/api/markets/market-sweep-export', { cache: 'no-store' });
        const json = await res.json();
        if (!alive || !json.ok) return;
        setData(json);
      } catch {
        // preserve old state
      }
    }

    load();
    const interval = setInterval(load, 60_000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (!data) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Market Sweep Export</div>
        <div className="mt-3 text-sm text-slate-400">Composing M1 export surface</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Market Sweep Export</div>
          <div className="mt-1 text-sm text-slate-300">{data.oneLineTakeaway}</div>
        </div>
        <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${tone(data.status)}`}>
          {data.status}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {data.operatorBullets.map((line, index) => (
          <div
            key={`${index}-${line}`}
            className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300"
          >
            {line}
          </div>
        ))}
      </div>
    </section>
  );
}
