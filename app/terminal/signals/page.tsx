'use client';

import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export default function SignalsPage() {
  const { snapshot } = useTerminalSnapshot();
  const signals = (snapshot?.signals?.data ?? {}) as { agents?: Array<{ agentName: string; healthy: boolean; reason?: string }> };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 text-sm font-semibold uppercase tracking-wide">Micro-agent signals</div>
      <div className="grid gap-3 md:grid-cols-2">
        {(signals.agents ?? []).map((agent) => (
          <div key={agent.agentName} className="rounded border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs font-mono text-slate-400">{agent.agentName}</div>
            <div className={agent.healthy ? 'text-emerald-300' : 'text-rose-300'}>{agent.healthy ? 'healthy' : 'anomaly'}</div>
            {agent.reason ? <div className="mt-1 text-xs text-slate-400">{agent.reason}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
