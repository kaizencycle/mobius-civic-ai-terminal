'use client';

import { useEffect, useState } from 'react';
import type { Agent } from '@/lib/terminal/types';
import type { DataSource } from '@/lib/response-envelope';
import { useMobiusIdentity } from '@/hooks/useMobiusIdentity';
import { statusColor, cn } from '@/lib/terminal/utils';
import DataSourceBadge from './DataSourceBadge';
import SectionLabel from './SectionLabel';

type AgentMode = 'nominal' | 'degraded' | 'critical';
type SourceHealth = 'ok' | 'degraded' | 'failed' | 'cached';

type MicroAgent = {
  agentName: string;
  healthy: boolean;
  polledAt: string;
  errors: string[];
  mode?: AgentMode;
  sourceStatus?: Record<string, SourceHealth>;
  fallbackUsed?: string | null;
  lastGoodAt?: string | null;
};

type MicroSweepResponse = {
  ok: boolean;
  cached?: boolean;
  timestamp: string;
  agents: MicroAgent[];
};

type AgentStatusEnvelope = {
  source?: DataSource;
  freshAt?: string | null;
  degraded?: boolean;
};

export default function AgentCortexPanel({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId?: string;
  onSelect?: (agent: Agent) => void;
}) {
  const { identity, hasPermission, loading } = useMobiusIdentity();
  const [themis, setThemis] = useState<MicroAgent | null>(null);
  const [microCached, setMicroCached] = useState(false);
  const [source, setSource] = useState<DataSource>('mock');
  const [freshAt, setFreshAt] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const canInvoke = hasPermission('agents:invoke');
  const visibleAgents = identity
    ? agents.filter((agent) => identity.agent_permissions.includes(agent.name.toUpperCase()))
    : agents;

  useEffect(() => {
    let alive = true;

    async function loadMicroState() {
      try {
        const [microRes, agentsRes] = await Promise.all([
          fetch('/api/signals/micro', { cache: 'no-store' }),
          fetch('/api/agents/status', { cache: 'no-store' }),
        ]);
        const json: MicroSweepResponse = await microRes.json();
        const agentsJson: AgentStatusEnvelope = await agentsRes.json();
        if (!alive || !json.ok) return;

        const nextThemis = json.agents.find((agent) => agent.agentName === 'THEMIS') ?? null;
        setThemis(nextThemis);
        setMicroCached(Boolean(json.cached));
        setSource(agentsJson.source ?? 'mock');
        setFreshAt(agentsJson.freshAt ?? null);
        setDegraded(Boolean(agentsJson.degraded));
      } catch {
        // Keep prior THEMIS state if refresh fails.
      }
    }

    loadMicroState();
    const interval = setInterval(loadMicroState, 30000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  function themisTone(mode?: AgentMode, healthy = true) {
    if (mode === 'critical') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
    if (mode === 'degraded') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    if (mode === 'nominal') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    return healthy
      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
      : 'border-amber-500/20 bg-amber-500/5 text-amber-200';
  }

  function sourceTone(status: SourceHealth) {
    switch (status) {
      case 'ok':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
      case 'degraded':
        return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
      case 'cached':
        return 'border-sky-500/20 bg-sky-500/10 text-sky-300';
      case 'failed':
      default:
        return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
    }
  }

  return (
    <section
      className={cn(
        'rounded-xl border bg-slate-900/60 p-4',
        degraded ? 'border-amber-500/40' : 'border-slate-800'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionLabel
          title="Agent Cortex"
          subtitle="Live substrate operator map"
        />
        <DataSourceBadge source={source} freshAt={freshAt} degraded={degraded} />
      </div>
      {identity ? (
        <div className="mt-3 text-[11px] font-mono uppercase tracking-[0.14em] text-slate-500">
          @{identity.username} · {identity.role} · agent access {identity.agent_permissions.join(', ')}
        </div>
      ) : null}
      {!canInvoke ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-500">
          {loading
            ? 'Loading agent access…'
            : 'Agent invocation unavailable for current role. Read-only status view only.'}
        </div>
      ) : null}

      {themis ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-slate-500">
                Micro Watch
              </div>
              <div className="mt-1 text-sm text-slate-300">
                THEMIS governance transparency posture
              </div>
            </div>

            <div
              className={cn(
                'rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em]',
                themisTone(themis.mode, themis.healthy),
              )}
            >
              THEMIS {themis.mode ? themis.mode.toUpperCase() : themis.healthy ? 'NOMINAL' : 'DEGRADED'}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {themis.fallbackUsed ? (
              <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-amber-300">
                fallback · {themis.fallbackUsed}
              </span>
            ) : null}
            {microCached ? (
              <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-sky-300">
                cached sweep
              </span>
            ) : null}
            <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">
              polled · {new Date(themis.polledAt).toLocaleTimeString()}
            </span>
          </div>

          {themis.sourceStatus ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(themis.sourceStatus).map(([source, status]) => (
                <span
                  key={`themis-${source}`}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em]',
                    sourceTone(status),
                  )}
                >
                  {source}: {status}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 xl:grid-cols-4">
        {visibleAgents.map((agent) => (
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
      {degraded ? (
        <div className="mt-3 text-xs text-amber-300">
          Showing mock/cached data — live source offline
        </div>
      ) : null}
    </section>
  );
}
