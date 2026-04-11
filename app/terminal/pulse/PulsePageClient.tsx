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
  type?: string;
  category?: string;
  tags?: string[];
  mii_score?: number;
  source?: string;
  status?: string;
};

const EVENT_TYPES = ['HEARTBEAT', 'WATCH', 'CATALOG', 'EPICON', 'JOURNAL', 'VERIFY', 'ROUTING', 'PROMOTION', 'SIGNAL'] as const;

function mapEventType(item: PulseItem): (typeof EVENT_TYPES)[number] | 'OTHER' {
  const raw = [item.type, item.category, item.title, ...(item.tags ?? [])]
    .filter((v): v is string => Boolean(v))
    .join(' ')
    .toLowerCase();
  if (raw.includes('heartbeat')) return 'HEARTBEAT';
  if (raw.includes('watch') || raw.includes('tripwire')) return 'WATCH';
  if (raw.includes('catalog')) return 'CATALOG';
  if (raw.includes('journal')) return 'JOURNAL';
  if (raw.includes('verify') || raw.includes('verification') || raw.includes('zeus')) return 'VERIFY';
  if (raw.includes('routing') || raw.includes('route')) return 'ROUTING';
  if (raw.includes('promotion') || raw.includes('promoted') || raw.includes('promoter')) return 'PROMOTION';
  if (raw.includes('signal') || raw.includes('integrity')) return 'SIGNAL';
  if (raw.includes('epicon') || item.id.startsWith('epi_') || item.id.startsWith('epicon')) return 'EPICON';
  return 'OTHER';
}

export default function PulsePageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [selected, setSelected] = useState<(typeof AGENT_FILTERS)[number]>('ALL');
  if (loading && !snapshot) return <ChamberSkeleton blocks={8} />;

  const items = useMemo(
    () => ((snapshot?.epicon?.data ?? {}) as { items?: PulseItem[] }).items ?? [],
    [snapshot],
  );
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
          <article key={item.id} className="rounded border border-slate-800 bg-slate-900/60 p-2.5 md:p-3">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
              <span className="rounded border border-cyan-600/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-100">
                {mapEventType(item)}
              </span>
              <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-slate-400">{item.agent ?? 'SYSTEM'}</span>
              <span className="text-slate-500">{item.status ?? 'active'}</span>
            </div>
            <div className="text-sm font-semibold leading-snug text-slate-100">
              {item.title ?? 'Untitled EPICON event'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span>{item.timestamp ?? '—'}</span>
              <span>sev {item.severity ?? 'unknown'}</span>
              <span>MII {item.mii_score ?? '—'}</span>
            </div>
            <details className="mt-1.5 text-[10px] text-slate-500">
              <summary className="cursor-pointer list-none text-slate-500 underline decoration-dotted underline-offset-2">
                More details
              </summary>
              <div className="mt-1">source {item.source ?? '—'} · id {item.id}</div>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
