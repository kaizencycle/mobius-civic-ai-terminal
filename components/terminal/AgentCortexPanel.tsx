'use client';

import { useEffect, useState } from 'react';
import type { Agent } from '@/lib/terminal/types';
import { statusColor, cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

export default function AgentCortexPanel({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId?: string;
  onSelect?: (agent: Agent) => void;
}) {
  const [canInvoke, setCanInvoke] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPermissions() {
      try {
        const res = await fetch('/api/identity/me?username=kaizencycle', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        setCanInvoke(Boolean(json.permissions?.includes('agents:invoke')));
      } catch {
        if (active) {
          setCanInvoke(false);
        }
      }
    }

    loadPermissions();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Agent Cortex"
        subtitle="Live substrate operator map"
      />
      {!canInvoke ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-500">
          Agent invocation unavailable for current role. Read-only status view only.
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 xl:grid-cols-4">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onSelect?.(agent)}
            className={cn(
              'rounded-lg border p-3 text-left transition',
              selectedId === agent.id
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-mono font-semibold text-white">
                {agent.name}
              </div>
              <div className={cn(
                'h-2.5 w-2.5 rounded-full',
                agent.color,
                agent.status !== 'idle' && 'agent-glow',
              )} />
            </div>
            <div className="mt-1 text-xs font-sans text-slate-400">
              {agent.role}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  statusColor(agent.status),
                  agent.status !== 'idle' && 'agent-pulse',
                )}
              />
              <span className="text-xs font-mono uppercase tracking-[0.15em] text-slate-300">
                {agent.status}
              </span>
            </div>

            <div className="mt-3 text-xs font-sans text-slate-400">
              {agent.lastAction}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Heartbeat</span>
              <span
                className={
                  agent.heartbeatOk ? 'text-emerald-300' : 'text-red-300'
                }
              >
                {agent.heartbeatOk ? 'OK' : 'FAIL'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
