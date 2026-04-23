'use client';

import { useEffect, useState } from 'react';
import type { RatesDollarFusionPayload } from '@/lib/markets/rates-dollar-fusion';

function formatUsd(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPct(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

function formatIndex(value: number | null) {
  return value === null ? '—' : value.toFixed(2);
}

function tone(status: 'nominal' | 'watch' | 'stressed' | 'critical') {
  if (status === 'critical') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (status === 'stressed') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'watch') return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
}

export default function RatesDollarFusionCard() {
  const [data, setData] = useState<RatesDollarFusionPayload | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch('/api/markets/rates-dollar-fusion', { cache: 'no-store' });
        const json = await res.json();
        if (!alive || !json.ok) return;
        setData(json);
      } catch {
        // preserve prior state
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
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Rates + Dollar Fusion</div>
        <div className="mt-3 text-sm text-slate-400">
          Syncing macro transmission surface
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Rates + Dollar Fusion</div>
          <div className="mt-1 text-sm text-slate-300">{data.summary}</div>
        </div>
        <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${tone(data.regime)}`}>
          {data.regime}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">10Y</div>
          <div className="mt-1 text-sm font-medium text-white">{formatPct(data.overlays.tenYearYield)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">30Y</div>
          <div className="mt-1 text-sm font-medium text-white">{formatPct(data.overlays.thirtyYearYield)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">DXY</div>
          <div className="mt-1 text-sm font-medium text-white">{formatIndex(data.overlays.dxy)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">VIX</div>
          <div className="mt-1 text-sm font-medium text-white">{formatIndex(data.overlays.vix)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Debt / Day</div>
          <div className="mt-1 text-sm font-medium text-white">{formatUsd(data.treasury.debtPerDay)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Debt / Sec</div>
          <div className="mt-1 text-sm font-medium text-white">{formatUsd(data.treasury.debtPerSecond)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Freshness</div>
          <div className="mt-1 text-sm font-medium text-white">{data.treasury.freshness}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Fiscal Alerts</div>
          <div className="mt-1 text-sm font-medium text-white">{data.treasury.fiscalAlertCount}</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Market Signal</div>
        <div className="mt-1 text-sm text-white">{data.marketSignal}</div>
        <div className="mt-2 text-xs text-slate-400">
          Overlay source · {data.overlays.source}
          {data.overlays.provider ? ` (${data.overlays.provider})` : ''}
          {data.overlays.asOf ? ` · ${data.overlays.asOf}` : ''}
          {data.overlays.available ? '' : ' · unavailable'}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {data.takeaways.map((line, index) => (
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
