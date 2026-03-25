'use client';

import { useEffect, useMemo, useState } from 'react';
import TreasuryDeepCompositionPanel, { type TreasuryDeepCompositionItem } from './TreasuryDeepCompositionPanel';
import TreasuryCompositionPanel, { type TreasuryCompositionItem } from './TreasuryCompositionPanel';
import TreasuryMiniChart, { type TreasuryChartPoint } from './TreasuryMiniChart';

type TreasuryHistoryResponse = {
  ok: boolean;
  series: 'totalDebt' | 'debtHeldPublic' | 'velocity';
  window: '30d' | '90d' | '1y';
  points: TreasuryChartPoint[];
};

type TreasuryCompositionResponse = {
  ok: boolean;
  asOf: string;
  timestamp: string;
  categories: TreasuryCompositionItem[];
};

type TreasuryDeepCompositionResponse = {
  ok: boolean;
  asOf: string;
  source: string;
  dataset: string;
  canonicalOrder: string[];
  categories: TreasuryDeepCompositionItem[];
};

type FreshnessState = 'fresh' | 'degraded' | 'stale';
type WatchMode = 'official' | 'interpolated' | 'stale' | 'degraded';
type StressStatus = 'nominal' | 'watch' | 'stressed' | 'critical';

type TreasuryWatchResponse = {
  ok: boolean;
  mode: WatchMode;
  source: string;
  dataset: string;
  recordDate: string;
  officialUpdatedAt: string;
  totalDebt: number;
  debtHeldPublic: number;
  intragovernmentalHoldings: number;
  delta1d: number;
  delta7dAvg: number;
  ratePerSecond: number;
  freshness: {
    state: FreshnessState;
    secondsSinceOfficialUpdate: number;
  };
  interpolation: {
    active: boolean;
    baseValue: number;
    baseTimestamp: string;
    method: string;
  };
  stress: {
    status: StressStatus;
    reasons: string[];
  };
  provenance: {
    official: boolean;
    estimatedDisplayValue: boolean;
    fallbackUsed: string | null;
  };
};

function formatUsd(value: number) {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

function formatRate(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B/s`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M/s`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K/s`;
  return `$${value.toFixed(0)}/s`;
}

function modeTone(mode: WatchMode) {
  switch (mode) {
    case 'official':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    case 'interpolated':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
    case 'stale':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    case 'degraded':
    default:
      return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  }
}

function stressTone(status: StressStatus) {
  switch (status) {
    case 'nominal':
      return 'text-emerald-300';
    case 'watch':
      return 'text-sky-300';
    case 'stressed':
      return 'text-amber-300';
    case 'critical':
    default:
      return 'text-rose-300';
  }
}

export default function TreasuryWatchCard() {
  const [data, setData] = useState<TreasuryWatchResponse | null>(null);
  const [displayDebt, setDisplayDebt] = useState<number | null>(null);
  const [history, setHistory] = useState<TreasuryChartPoint[]>([]);
  const [composition, setComposition] = useState<TreasuryCompositionItem[]>([]);
  const [compositionAsOf, setCompositionAsOf] = useState<string>('');
  const [deepComposition, setDeepComposition] = useState<TreasuryDeepCompositionItem[]>([]);
  const [deepCompositionAsOf, setDeepCompositionAsOf] = useState<string>('');
  const [deepCanonicalOrder, setDeepCanonicalOrder] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [watchRes, historyRes, compositionRes, deepCompositionRes] = await Promise.all([
          fetch('/api/treasury/watch', { cache: 'no-store' }),
          fetch('/api/treasury/history?window=30d&series=velocity', { cache: 'no-store' }),
          fetch('/api/treasury/composition', { cache: 'no-store' }),
          fetch('/api/treasury/deep-composition', { cache: 'no-store' }),
        ]);

        const watchJson: TreasuryWatchResponse = await watchRes.json();
        const historyJson: TreasuryHistoryResponse = await historyRes.json();
        const compositionJson: TreasuryCompositionResponse = await compositionRes.json();
        const deepCompositionJson: TreasuryDeepCompositionResponse = await deepCompositionRes.json();
        if (!alive || !watchJson.ok) return;

        setData(watchJson);
        setDisplayDebt(watchJson.totalDebt);
        setHistory(historyJson.ok ? historyJson.points : []);
        if (compositionJson.ok) {
          setComposition(compositionJson.categories);
          setCompositionAsOf(compositionJson.asOf);
        }
        if (deepCompositionJson.ok) {
          setDeepComposition(deepCompositionJson.categories);
          setDeepCompositionAsOf(deepCompositionJson.asOf);
          setDeepCanonicalOrder(deepCompositionJson.canonicalOrder);
        }
      } catch {
        // Preserve previous value on refresh failure.
      }
    }

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    if (!data.interpolation.active || !data.provenance.estimatedDisplayValue) {
      setDisplayDebt(data.totalDebt);
      return;
    }

    const timer = setInterval(() => {
      setDisplayDebt((prev) => (prev ?? data.totalDebt) + data.ratePerSecond);
    }, 1000);

    return () => clearInterval(timer);
  }, [data]);

  const debtPerHour = useMemo(() => (data ? data.ratePerSecond * 3600 : 0), [data]);

  if (!data) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Treasury Watch</div>
        <div className="mt-3 text-sm text-slate-400">Booting fiscal surface · awaiting Treasury snapshot</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Treasury Watch</div>
          <div className="mt-1 text-sm text-slate-300">Magnitude, velocity, provenance, and fiscal stress posture</div>
        </div>
        <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${modeTone(data.mode)}`}>
          {data.mode}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Total Debt</div>
        <div className="mt-1 text-2xl font-semibold text-white">{formatUsd(displayDebt ?? data.totalDebt)}</div>
        <div className="mt-1 text-xs text-slate-400">As of {data.recordDate} · {data.dataset}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Held by Public</div>
          <div className="mt-1 text-sm font-medium text-white">{formatUsd(data.debtHeldPublic)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Intragov</div>
          <div className="mt-1 text-sm font-medium text-white">{formatUsd(data.intragovernmentalHoldings)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Debt / Day</div>
          <div className="mt-1 text-sm font-medium text-white">{formatUsd(data.delta1d)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Debt / Hour</div>
          <div className="mt-1 text-sm font-medium text-white">{formatUsd(debtPerHour)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Debt / Sec</div>
          <div className="mt-1 text-sm font-medium text-white">{formatRate(data.ratePerSecond)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Stress Posture</div>
          <div className={`text-[11px] uppercase tracking-[0.14em] ${stressTone(data.stress.status)}`}>{data.stress.status}</div>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {data.stress.reasons.length > 0 ? data.stress.reasons.join(' · ') : 'No active fiscal stress reasons'}
        </div>
      </div>

      <div className="mt-4">
        <TreasuryMiniChart points={history} label="30d debt velocity" />
      </div>

      <div className="mt-4">
        <TreasuryCompositionPanel asOf={compositionAsOf || data.recordDate} categories={composition} />
      </div>

      <div className="mt-4">
        <TreasuryDeepCompositionPanel
          asOf={deepCompositionAsOf || compositionAsOf || data.recordDate}
          categories={deepComposition}
          canonicalOrder={deepCanonicalOrder}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
          freshness · {data.freshness.state}
        </span>
        <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
          source · {data.source}
        </span>
        <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
          method · {data.interpolation.method}
        </span>
        {data.provenance.fallbackUsed ? (
          <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-300">
            fallback · {data.provenance.fallbackUsed}
          </span>
        ) : null}
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Official refresh {new Date(data.officialUpdatedAt).toLocaleString()} · 7d avg {formatUsd(data.delta7dAvg)}/day
      </div>
    </section>
  );
}
