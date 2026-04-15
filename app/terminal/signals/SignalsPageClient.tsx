'use client';

import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type AgentSignal = { agentName: string; healthy?: boolean; reason?: string; score?: number; updatedAt?: string; raw?: unknown };

type MicroSweepPayload = {
  agents?: AgentSignal[];
  instrumentCount?: number;
  composite?: number;
  timestamp?: string;
};

export default function SignalsPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  if (loading && !snapshot) return <ChamberSkeleton blocks={4} />;

  const signals = (snapshot?.signals?.data ?? {}) as MicroSweepPayload;
  const agents = signals.agents ?? [];
  const expected = signals.instrumentCount ?? agents.length;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="shrink-0 text-[11px] text-slate-400">
        <span className="font-mono text-slate-200">{agents.length}</span>
        {expected && agents.length !== expected ? (
          <span className="text-amber-400/90"> / {expected} instruments</span>
        ) : expected ? (
          <span> instruments · composite {typeof signals.composite === 'number' ? signals.composite.toFixed(3) : '—'}</span>
        ) : null}
        {signals.timestamp ? (
          <span className="ml-2 text-slate-500">sweep {signals.timestamp}</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 grid grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {agents.map((agent) => (
          <section key={agent.agentName} className="rounded border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold">{agent.agentName}</div>
            <div className="mt-2 h-2 rounded bg-slate-800">
              <div className={`h-2 rounded ${agent.healthy ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${Math.max(10, Math.round((agent.score ?? (agent.healthy ? 0.85 : 0.45)) * 100))}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-300">{agent.reason ?? 'Signal stream nominal.'}</div>
            <div className="mt-2 text-xs text-slate-500">updated {agent.updatedAt ?? snapshot?.timestamp ?? '—'}</div>
            <pre className="mt-2 max-h-48 overflow-auto overflow-x-auto text-[10px] text-slate-500">{JSON.stringify(agent.raw ?? agent, null, 2)}</pre>
          </section>
        ))}
      </div>
    </div>
  );
}
