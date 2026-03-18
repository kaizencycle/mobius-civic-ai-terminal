'use client';

export default function TerminalShellFallback({
  statusLabel = 'Booting Mobius Terminal...',
}: {
  statusLabel?: string;
}) {
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

      <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {['GI --', 'MII --', 'MIC --', 'TRIPWIRE WATCH', 'LEDGER syncing', 'INGEST checking', 'CYCLE checking'].map((item) => (
            <div key={item} className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
              {item}
            </div>
          ))}
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
