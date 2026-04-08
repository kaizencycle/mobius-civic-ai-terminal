'use client';

import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type AgentSignal = { agentName: string; healthy?: boolean; reason?: string; score?: number; updatedAt?: string; raw?: unknown };

export default function SignalsPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  if (loading && !snapshot) return <ChamberSkeleton blocks={4} />;

  const signals = (snapshot?.signals?.data ?? {}) as { agents?: AgentSignal[] };
  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2">
      {(signals.agents ?? []).slice(0, 4).map((agent) => (
        <section key={agent.agentName} className="rounded border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-sm font-semibold">{agent.agentName}</div>
          <div className="mt-2 h-2 rounded bg-slate-800">
            <div className={`h-2 rounded ${agent.healthy ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${Math.max(10, Math.round((agent.score ?? (agent.healthy ? 0.85 : 0.45)) * 100))}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-300">{agent.reason ?? 'Signal stream nominal.'}</div>
          <div className="mt-2 text-xs text-slate-500">updated {agent.updatedAt ?? snapshot?.timestamp ?? '—'}</div>
          <pre className="mt-2 overflow-x-auto text-[10px] text-slate-500">{JSON.stringify(agent.raw ?? agent, null, 2)}</pre>
        </section>
      ))}
    </div>
  );
}
