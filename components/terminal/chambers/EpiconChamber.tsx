'use client';

import { useEffect, useState } from 'react';
import { fetchEpiconEvents } from '@/lib/terminal/epicon';
import type { EpiconEvent, ConfidenceTier } from '@/lib/terminal/epicon';
import { EpiconInspector } from './EpiconInspector';
import { EpiconFilterBar } from './EpiconFilterBar';
import { EpiconIngestBadge } from './EpiconIngestBadge';

const TIER_STYLE: Record<ConfidenceTier, string> = {
  VERIFIED:     'bg-green-950 text-green-300 border border-green-800',
  PENDING:      'bg-amber-950 text-amber-300 border border-amber-800',
  CONTRADICTED: 'bg-red-950 text-red-300 border border-red-800',
  ARCHIVED:     'bg-zinc-800 text-zinc-500 border border-zinc-700',
};

function confidenceColor(c: number): string {
  if (c >= 0.80) return 'text-green-400';
  if (c >= 0.60) return 'text-amber-400';
  return 'text-red-400';
}

export default function EpiconChamber() {
  const [events, setEvents]         = useState<EpiconEvent[]>([]);
  const [filtered, setFiltered]     = useState<EpiconEvent[]>([]);
  const [selected, setSelected]     = useState<EpiconEvent | null>(null);
  const [loading, setLoading]       = useState(true);
  const [ingestCount, setIngestCount] = useState(0);

  useEffect(() => {
    fetchEpiconEvents().then((data) => {
      setEvents(data);
      setFiltered(data);
      setLoading(false);
    });
    const tick = setInterval(() => setIngestCount((n: number) => n + 1), 4000);
    return () => clearInterval(tick);
  }, []);

  if (loading) return (
    <div className="p-6 font-mono text-amber-400 text-xs animate-pulse">
      EPICON · loading event ledger…
    </div>
  );

  return (
    <div className="flex flex-col h-full font-mono text-xs">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <span className="text-fuchsia-400 font-bold tracking-widest">≡ EPICON FEED</span>
        <EpiconIngestBadge count={ingestCount} events={events} />
      </div>

      {/* Filter bar */}
      <EpiconFilterBar events={events} onFilter={setFiltered} />

      {/* Event table + Inspector split */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto">
          {filtered.map((ev) => (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(selected?.id === ev.id ? null : ev)}
              onKeyDown={(e) => e.key === 'Enter' && setSelected(selected?.id === ev.id ? null : ev)}
              className={`px-4 py-3 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-900 transition-colors ${
                selected?.id === ev.id ? 'bg-zinc-900 border-l-2 border-l-fuchsia-500' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${TIER_STYLE[ev.tier]}`}>
                  {ev.tier}
                </span>
                <span className="text-zinc-600">{ev.cycle}</span>
                <span className="text-sky-400">{ev.agent}</span>
                <span className={`ml-auto font-bold ${confidenceColor(ev.confidence)}`}>
                  {(ev.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-zinc-100 mb-0.5 leading-snug">{ev.label}</div>
              <div className="text-zinc-500 truncate">{ev.summary}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-6 text-zinc-600 text-center">No events match filter</div>
          )}
        </div>

        {selected && (
          <EpiconInspector event={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}
