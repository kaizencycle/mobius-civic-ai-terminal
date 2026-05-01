'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function RouterPageClient() {
  const { data: metrics } = useSWR('/api/router/metrics', fetcher, { refreshInterval: 5000 });
  const { data: reasoning } = useSWR('/api/agents/reasoning', fetcher, { refreshInterval: 5000 });

  const summary = metrics?.summary;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <section className="rounded border border-slate-700 bg-slate-950/70 p-3">
        <h1 className="text-lg font-semibold">Mobius Router</h1>
        <p className="text-xs text-slate-400 mt-1">Read-only compute routing intelligence (Phase 4)</p>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-xs text-slate-400 mb-2">Route Distribution</div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {summary && Object.entries(summary.byRoute).map(([k, v]) => (
            <div key={k} className="rounded border border-slate-700 p-2 text-center">
              <div className="font-mono text-slate-200">{k}</div>
              <div className="text-slate-400">{v as number}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-xs text-slate-400 mb-2">Recent Decisions</div>
        <div className="space-y-2 text-xs">
          {metrics?.recent?.map((r: any) => (
            <div key={r.id} className="rounded border border-slate-800 p-2">
              <div className="text-slate-200 font-mono">{r.route}</div>
              <div className="text-slate-400">{r.reason}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-xs text-slate-400 mb-2">Agent Routing</div>
        <div className="space-y-2 text-xs">
          {reasoning?.decisions?.map((d: any) => (
            <div key={d.agent} className="rounded border border-slate-800 p-2">
              <div className="flex justify-between">
                <span className="text-slate-200">{d.agent}</span>
                <span className="font-mono text-cyan-300">{d.router.route}</span>
              </div>
              <div className="text-slate-400">{d.router.reason}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
