'use client';

import { useEffect, useState } from 'react';

type Tripwire = {
  active: boolean;
  level: 'none' | 'watch' | 'elevated';
  reason: string;
  last_updated: string;
};

type Freshness = {
  status: 'fresh' | 'degraded' | 'stale';
  seconds: number;
};

function tone(level: Tripwire['level']) {
  switch (level) {
    case 'watch':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'elevated':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    default:
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
}

function freshnessLabel(freshness: Freshness | null) {
  if (freshness?.status === 'fresh') return 'Runtime fresh';
  if (freshness?.status === 'degraded') return 'Runtime degraded';
  if (freshness?.status === 'stale') return 'Runtime stale';
  return 'Checking runtime';
}

function freshnessTone(freshness: Freshness | null) {
  if (freshness?.status === 'fresh') return 'text-emerald-300';
  if (freshness?.status === 'degraded') return 'text-amber-300';
  if (freshness?.status === 'stale') return 'text-rose-300';
  return 'text-slate-500';
}

export default function TripwirePanel() {
  const [tripwire, setTripwire] = useState<Tripwire | null>(null);
  const [freshness, setFreshness] = useState<Freshness | null>(null);

  async function load() {
    const res = await fetch('/api/tripwire/status', { cache: 'no-store' });
    const json = await res.json();
    setTripwire(json.tripwire);
    setFreshness(json.freshness);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!tripwire) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-slate-400">
        Loading tripwire state...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Tripwire State</div>
      <div className={`mt-2 text-xs ${freshnessTone(freshness)}`}>{freshnessLabel(freshness)}</div>

      <div className={`mt-3 inline-flex rounded-md border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${tone(tripwire.level)}`}>
        {tripwire.level}
      </div>

      <div className="mt-3 text-sm text-white">{tripwire.reason}</div>
      <div className="mt-2 text-xs text-slate-500">Last updated: {new Date(tripwire.last_updated).toLocaleString()}</div>
    </div>
  );
}
