'use client';

import { useEffect, useState } from 'react';
import type { MacroIntegrityPulse } from '@/lib/markets/macro-integrity';

function tone(status: 'healthy' | 'watch' | 'degraded' | 'critical') {
  if (status === 'critical') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (status === 'degraded') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'watch') return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
}

export default function MacroIntegrityPulseCard() {
  const [data, setData] = useState<MacroIntegrityPulse | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch('/api/markets/macro-integrity', { cache: 'no-store' });
        const json = await res.json();
        if (!alive || !json.ok) return;
        setData(json);
      } catch {
        // keep old state
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
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Macro Integrity Pulse</div>
        <div className="mt-3 text-sm text-slate-400">Syncing macro trust surface</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Macro Integrity Pulse</div>
          <div className="mt-1 text-sm text-slate-300">
            Provider trust score before macro signals enter M1
          </div>
        </div>
        <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${tone(data.status)}`}>
          {data.status}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Score</div>
          <div className="mt-1 text-sm font-medium text-white">{(data.score * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Provider</div>
          <div className="mt-1 text-sm font-medium text-white">{data.activeProvider}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Freshness</div>
          <div className="mt-1 text-sm font-medium text-white">{data.freshness.status}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Fields</div>
          <div className="mt-1 text-sm font-medium text-white">
            {data.completeness.presentFields}/{data.completeness.totalFields}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Cross-Provider Check</div>
        <div className="mt-1 text-sm text-white">
          {data.disagreement.divergenceFlags.length === 0
            ? 'No active divergence flags'
            : data.disagreement.divergenceFlags.join(' · ')}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {data.notes.map((note, index) => (
          <div
            key={`${index}-${note}`}
            className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300"
          >
            {note}
          </div>
        ))}
      </div>
    </section>
  );
}
