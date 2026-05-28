'use client';

import { useEffect, useState } from 'react';
import { fetchTripwires, MOCK_CHAMBER_ENTRIES } from '@/lib/terminal/tripwire';
import type { TripwireEntry, TripwireSeverity } from '@/lib/terminal/tripwire';
import { TripwireSparkline } from './TripwireSparkline';
import { TripwireDrillDown } from './TripwireDrillDown';

const SEV_STYLE: Record<TripwireSeverity, string> = {
  INFO:     'bg-sky-950 text-sky-300 border border-sky-700',
  WARN:     'bg-amber-950 text-amber-300 border border-amber-700',
  CRITICAL: 'bg-red-950 text-red-300 border border-red-700',
};

const SEV_DOT: Record<TripwireSeverity, string> = {
  INFO:     'bg-sky-400',
  WARN:     'bg-amber-400',
  CRITICAL: 'bg-red-400 animate-pulse',
};

function relativeTime(ts: number): string {
  const delta = Math.floor((Date.now() - ts) / 1000);
  if (delta < 60)   return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export default function TripwireChamber() {
  const [entries, setEntries] = useState<TripwireEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TripwireEntry | null>(null);
  const [tab, setTab] = useState<'active' | 'resolved'>('active');

  useEffect(() => {
    // G-03: 2s client-side fallback so mock renders immediately if API is slow
    const fallback = setTimeout(() => {
      setEntries((prev) => (prev.length > 0 ? prev : MOCK_CHAMBER_ENTRIES));
      setLoading(false);
    }, 2000);

    fetchTripwires()
      .then((data) => {
        clearTimeout(fallback);
        setEntries(data);
        setLoading(false);
      })
      .catch(() => {
        clearTimeout(fallback);
        setEntries(MOCK_CHAMBER_ENTRIES);
        setLoading(false);
      });

    return () => clearTimeout(fallback);
  }, []);

  const visible      = entries.filter((e) => tab === 'active' ? !e.resolved : e.resolved);
  const activeCount  = entries.filter((e) => !e.resolved).length;
  const resolvedCount = entries.filter((e) => e.resolved).length;

  if (loading) return (
    <div className="p-6 font-mono text-amber-400 text-xs animate-pulse">
      TRIPWIRE · loading anomaly feed…
    </div>
  );

  return (
    <div className="flex flex-col h-full font-mono text-xs">
      {/* Header bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <span className="text-red-400 font-bold tracking-widest">⚡ TRIPWIRE WATCH</span>
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={() => { setTab('active'); setSelected(null); }}
            className={`px-3 py-0.5 rounded border text-xs transition-colors ${
              tab === 'active'
                ? 'bg-red-950 border-red-700 text-red-300'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            ACTIVE
            <span className="ml-1 bg-red-800 text-red-200 rounded px-1">{activeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('resolved'); setSelected(null); }}
            className={`px-3 py-0.5 rounded border text-xs transition-colors ${
              tab === 'resolved'
                ? 'bg-zinc-800 border-zinc-600 text-zinc-300'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            RESOLVED
            <span className="ml-1 bg-zinc-700 text-zinc-300 rounded px-1">{resolvedCount}</span>
          </button>
        </div>
      </div>

      {/* Sparkline */}
      <TripwireSparkline />

      {/* Feed + drill-down */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="p-6 text-zinc-600 text-center">
              {tab === 'active' ? 'No active anomalies' : 'No resolved anomalies'}
            </div>
          ) : (
            visible.map((entry) => (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(selected?.id === entry.id ? null : entry)}
                onKeyDown={(e) => e.key === 'Enter' && setSelected(selected?.id === entry.id ? null : entry)}
                className={`flex items-start gap-3 px-4 py-3 border-b border-zinc-800/60
                  cursor-pointer transition-colors hover:bg-zinc-900
                  ${selected?.id === entry.id ? 'bg-zinc-900 border-l-2 border-l-red-500' : ''}
                `}
              >
                <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${SEV_DOT[entry.severity]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${SEV_STYLE[entry.severity]}`}>
                      {entry.severity}
                    </span>
                    <span className="text-sky-400">{entry.agent}</span>
                    <span className="text-zinc-600 ml-auto flex-shrink-0">{relativeTime(entry.ts)}</span>
                  </div>
                  <div className="text-zinc-200 truncate">{entry.label}</div>
                  {entry.resolved && entry.resolvedBy && (
                    <div className="text-green-600 text-[10px] mt-0.5">✓ {entry.resolvedBy}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <TripwireDrillDown entry={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}
