'use client';

import { useEffect, useState } from 'react';

type RouterMetrics = {
  summary?: {
    byRoute?: Record<string, number>;
  };
  recent?: Array<{
    id: string;
    route: string;
    reason: string;
  }>;
};

type AgentReasoning = {
  decisions?: Array<{
    agent: string;
    router?: {
      route: string;
      reason: string;
    };
  }>;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function RouterPageClient() {
  const [metrics, setMetrics] = useState<RouterMetrics | null>(null);
  const [reasoning, setReasoning] = useState<AgentReasoning | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [nextMetrics, nextReasoning] = await Promise.all([
        getJson<RouterMetrics>('/api/router/metrics'),
        getJson<AgentReasoning>('/api/agents/reasoning'),
      ]);
      if (!mounted) return;
      setMetrics(nextMetrics);
      setReasoning(nextReasoning);
    }

    void load();
    const timer = window.setInterval(() => void load(), 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const byRoute = metrics?.summary?.byRoute ?? { local: 0, cloud: 0, 'cloud+zeus': 0, hybrid: 0 };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <section className="rounded border border-slate-700 bg-slate-950/70 p-3">
        <h1 className="text-lg font-semibold">Mobius Router</h1>
        <p className="text-xs text-slate-400 mt-1">Read-only compute routing intelligence (Phase 4)</p>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-xs text-slate-400 mb-2">Route Distribution</div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {Object.entries(byRoute).map(([k, v]) => (
            <div key={k} className="rounded border border-slate-700 p-2 text-center">
              <div className="font-mono text-slate-200">{k}</div>
              <div className="text-slate-400">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-xs text-slate-400 mb-2">Recent Decisions</div>
        <div className="space-y-2 text-xs">
          {(metrics?.recent ?? []).map((record) => (
            <div key={record.id} className="rounded border border-slate-800 p-2">
              <div className="text-slate-200 font-mono">{record.route}</div>
              <div className="text-slate-400">{record.reason}</div>
            </div>
          ))}
          {(metrics?.recent ?? []).length === 0 ? <div className="text-slate-500">No router decisions recorded yet.</div> : null}
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-xs text-slate-400 mb-2">Agent Routing</div>
        <div className="space-y-2 text-xs">
          {(reasoning?.decisions ?? []).map((decision) => (
            <div key={decision.agent} className="rounded border border-slate-800 p-2">
              <div className="flex justify-between">
                <span className="text-slate-200">{decision.agent}</span>
                <span className="font-mono text-cyan-300">{decision.router?.route ?? 'unknown'}</span>
              </div>
              <div className="text-slate-400">{decision.router?.reason ?? 'router metadata unavailable'}</div>
            </div>
          ))}
          {(reasoning?.decisions ?? []).length === 0 ? <div className="text-slate-500">Agent reasoning unavailable.</div> : null}
        </div>
      </section>
    </div>
  );
}
