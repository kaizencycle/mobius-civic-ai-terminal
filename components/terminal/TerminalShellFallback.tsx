'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function TerminalShellFallback({
  statusLabel = 'Booting Mobius Terminal...',
}: {
  statusLabel?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'agent' | 'type' | 'severity' | 'gi' | 'status' | 'source'>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const resultCount: number = 0;
  const [gi] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="text-sm font-mono font-semibold uppercase tracking-[0.28em] text-sky-300">
          Mobius Terminal
        </div>
        <div className="mt-1 text-xs font-sans text-slate-500">
          Bloomberg-style civic command console for EPICON visibility, verification, and operator routing.
        </div>
      </div>

      <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-2 text-xs font-mono uppercase tracking-[0.15em] text-slate-400">
        {statusLabel}
      </div>

      <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search events, agents, signals..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-3 text-[11px] font-mono uppercase tracking-[0.06em] text-slate-300 placeholder:text-slate-600 transition-colors focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Sort</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="cursor-pointer appearance-none rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 pr-6 text-[11px] font-mono text-slate-400 transition-colors focus:border-sky-500/50 focus:outline-none"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
                backgroundSize: '10px',
              }}
            >
              <option value="time">Time</option>
              <option value="agent">Agent</option>
              <option value="type">Type</option>
              <option value="severity">Severity</option>
              <option value="gi">GI score</option>
              <option value="status">Status</option>
              <option value="source">Source</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex h-7 w-5 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-[11px] font-mono text-slate-400 transition-colors hover:border-sky-500/40 hover:text-sky-300"
              aria-label={`Toggle sort direction (currently ${sortDir})`}
            >
              {sortDir === 'desc' ? '↓' : '↑'}
            </button>
          </div>

          {searchQuery ? (
            <span className="whitespace-nowrap text-[10px] font-mono text-slate-500">
              {resultCount} result{resultCount !== 1 ? 's' : ''}
            </span>
          ) : null}

          <div className="ml-auto">
            <div
              className={cn(
                'rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-widest',
                gi != null && gi > 0.85
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : gi != null && gi > 0.7
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border-red-500/30 bg-red-500/10 text-red-400',
              )}
            >
              GI {gi?.toFixed(2) ?? '--'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-140px)] grid-cols-12 max-md:grid-cols-1">
        <aside className="col-span-2 border-r border-slate-800 bg-slate-950/50 p-4 max-md:border-r-0 max-md:border-b">
          <div className="space-y-2 text-xs font-mono uppercase tracking-[0.15em] text-slate-500">
            <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">Pulse</div>
            <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">Agents</div>
            <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">Ledger</div>
            <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">Tripwire</div>
            <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">Wallet</div>
          </div>
        </aside>

        <main className="col-span-7 border-r border-slate-800 p-4 max-md:border-r-0">
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-4">
            <div className="text-xs font-mono uppercase tracking-[0.18em] text-sky-300">Resilient shell</div>
            <div className="mt-2 text-sm text-slate-400">
              If live data is delayed, the terminal still explains what it does, shows freshness placeholders, and signals degraded or disconnected states instead of rendering a blank loading screen.
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-20 rounded-xl border border-slate-800 bg-slate-900/60" />
            ))}
          </div>
        </main>

        <section className="col-span-3 p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs font-mono uppercase tracking-[0.18em] text-slate-500">Inspector fallback</div>
            <div className="mt-2 h-56 rounded-lg border border-slate-800 bg-slate-950" />
            <div className="mt-3 text-xs text-slate-500">
              Degraded mode keeps the operator context visible while live hydration completes.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
