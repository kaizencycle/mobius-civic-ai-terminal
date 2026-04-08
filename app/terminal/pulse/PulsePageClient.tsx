'use client';

import { useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

const AGENT_FILTERS = ['ALL', 'ATLAS', 'ZEUS', 'EVE', 'HERMES', 'AUREA', 'JADE', 'DAEDALUS', 'ECHO'] as const;

type PulseItem = {
  id: string;
  agent?: string;
  title?: string;
  timestamp?: string;
  severity?: string;
  mii_score?: number;
  source?: string;
  status?: string;
};

export default function PulsePageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [selected, setSelected] = useState<(typeof AGENT_FILTERS)[number]>('ALL');
  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  const epicon = (snapshot?.epicon?.data ?? {}) as { items?: PulseItem[] };
  const items = epicon.items ?? [];
  const filtered = useMemo(
    () => (selected === 'ALL' ? items : items.filter((item) => (item.agent ?? '').toUpperCase() === selected)),
    [items, selected],
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Pulse Ledger</h1>
        <div className="text-xs text-slate-400">{filtered.length} entries</div>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {AGENT_FILTERS.map((name) => (
          <button key={name} onClick={() => setSelected(name)} className={`rounded border px-2 py-1 text-[11px] font-mono ${selected === name ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-100' : 'border-slate-700 text-slate-400'}`}>
            {name}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map((item) => (
          <article key={item.id} className="rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono">{item.agent ?? 'UNKNOWN'}</span>
              <span className="text-slate-300">{item.title ?? 'Untitled EPICON event'}</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {item.timestamp ?? '—'} · severity {item.severity ?? 'unknown'} · MII {item.mii_score ?? '—'} · source {item.source ?? '—'}
            </div>
            <div className="mt-1 text-xs text-cyan-200">{item.status ?? 'active'}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
