'use client';

import { useEffect, useState } from 'react';
import type { DataSource } from '@/lib/response-envelope';
import DataSourceBadge from '@/components/terminal/DataSourceBadge';

type Signal = {
  id: string;
  source_agent: string;
  category: string;
  title: string;
  summary: string;
  status: 'pending';
  confidence_tier: number;
  observed_at: string;
  tags: string[];
};

type RuntimeStatus = {
  ok: true;
  source?: DataSource;
  freshAt?: string | null;
  degraded?: boolean;
  last_run: string | null;
  freshness: {
    status: 'fresh' | 'nominal' | 'degraded' | 'stale' | 'unknown';
    seconds: number | null;
  };
};

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
  composite: number;
  healthy: boolean;
};

type EveSynthesisLedgerRow = {
  id: string;
  title: string;
  timestamp: string;
  body?: string;
  source?: string;
};

function isEveSynthesisLedgerRow(value: unknown): value is EveSynthesisLedgerRow {
  if (value === null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.timestamp === 'string' &&
    (o.body === undefined || typeof o.body === 'string') &&
    (o.source === undefined || typeof o.source === 'string')
  );
}

function freshnessLabel(runtime: RuntimeStatus | null) {
  if (runtime?.freshness.status === 'fresh') return 'System live';
  if (runtime?.freshness.status === 'nominal') return 'System nominal';
  if (runtime?.freshness.status === 'degraded') return 'System degraded';
  if (runtime?.freshness.status === 'stale') return 'System stale';
  return 'Checking system freshness';
}

function freshnessTone(runtime: RuntimeStatus | null) {
  if (runtime?.freshness.status === 'fresh') return 'text-emerald-300';
  if (runtime?.freshness.status === 'nominal') return 'text-sky-300';
  if (runtime?.freshness.status === 'degraded') return 'text-amber-300';
  if (runtime?.freshness.status === 'stale') return 'text-rose-300';
  return 'text-slate-500';
}

function modeTone(mode?: AgentMode, healthy = true) {
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
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'degraded':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'cached':
      return 'bg-sky-500/10 text-sky-300 border-sky-500/20';
    case 'failed':
    default:
      return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
  }
}

function formatMode(agent: MicroAgent) {
  if (agent.mode) return agent.mode.toUpperCase();
  return agent.healthy ? 'NOMINAL' : 'DEGRADED';
}

export default function PulseTimeline() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [micro, setMicro] = useState<MicroSweepResponse | null>(null);
  const [eveLedger, setEveLedger] = useState<EveSynthesisLedgerRow[]>([]);

  async function load() {
    try {
      const [pulseRes, runtimeRes, microRes, feedRes] = await Promise.all([
        fetch('/api/signals/pulse', { cache: 'no-store' }),
        fetch('/api/runtime/status', { cache: 'no-store' }),
        fetch('/api/signals/micro', { cache: 'no-store' }),
        fetch('/api/epicon/feed?limit=24&type=epicon', { cache: 'no-store' }),
      ]);

      const pulseJson = await pulseRes.json();
      const runtimeJson: RuntimeStatus = await runtimeRes.json();
      const microJson: MicroSweepResponse = await microRes.json();
      const feedJson: unknown = await feedRes.json();

      setSignals(pulseJson.signals || []);
      setRuntime(runtimeJson);
      setMicro(microJson.ok ? microJson : null);

      const itemsRaw =
        feedJson !== null && typeof feedJson === 'object' && 'items' in feedJson
          ? (feedJson as { items: unknown }).items
          : [];
      const items = Array.isArray(itemsRaw) ? itemsRaw.filter(isEveSynthesisLedgerRow) : [];
      setEveLedger(
        items.filter((row) => row.source === 'eve-synthesis').slice(0, 5),
      );
    } catch {
      // Preserve previous state if a refresh fails.
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const themis = micro?.agents.find((agent) => agent.agentName === 'THEMIS');
  const visibleAgents = micro?.agents ?? [];
  const source = runtime?.source ?? 'mock';
  const degraded = Boolean(runtime?.degraded);

  return (
    <div className={degraded ? 'rounded-xl border border-amber-500/40 p-3' : ''}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={`text-xs uppercase tracking-[0.18em] ${freshnessTone(runtime)}`}>{freshnessLabel(runtime)}</div>
          <div className="mt-2 text-sm text-slate-400">
            Incoming micro-agent signals and current intake state.
          </div>
        </div>

        <div className="text-right text-xs text-slate-500">
          <div className="mb-2 flex justify-end">
            <DataSourceBadge source={source} freshAt={runtime?.freshAt ?? null} degraded={degraded} />
          </div>
          <div>{runtime?.last_run ? `Updated ${new Date(runtime.last_run).toLocaleString()}` : 'Awaiting heartbeat'}</div>
          <div>{signals.length} active signals</div>
          <div>{micro ? `${visibleAgents.length} micro agents · composite ${micro.composite.toFixed(3)}` : 'Micro sweep pending'}</div>
        </div>
      </div>

      {micro ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Micro Agent Health
              </div>
              <div className="mt-1 text-sm text-slate-300">
                Live runtime posture for governance, routing, climate, and build micro-agents.
              </div>
            </div>

            <div className="text-right text-xs text-slate-500">
              <div>{micro.cached ? 'Cached sweep' : 'Live sweep'}</div>
              <div>{new Date(micro.timestamp).toLocaleString()}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {visibleAgents.map((agent) => (
              <div
                key={agent.agentName}
                className="cv-auto rounded-xl border border-slate-800 bg-slate-950/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {agent.agentName}
                    </div>
                    <div className="mt-1 text-sm text-white">
                      {agent.agentName === 'THEMIS'
                        ? 'Governance transparency posture'
                        : 'Micro-agent runtime posture'}
                    </div>
                  </div>

                  <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${modeTone(agent.mode, agent.healthy)}`}>
                    {formatMode(agent)}
                  </div>
                </div>

                {agent.fallbackUsed ? (
                  <div className="mt-3 text-xs text-amber-300">
                    Fallback active: {agent.fallbackUsed}
                    {agent.lastGoodAt ? ` · last good ${new Date(agent.lastGoodAt).toLocaleString()}` : ''}
                  </div>
                ) : null}

                {agent.sourceStatus ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(agent.sourceStatus).map(([source, status]) => (
                      <span
                        key={`${agent.agentName}-${source}`}
                        className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${sourceTone(status)}`}
                      >
                        {source}: {status}
                      </span>
                    ))}
                  </div>
                ) : null}

                {agent.errors.length > 0 ? (
                  <div className="mt-3 text-xs text-slate-400">
                    {agent.errors.length} issue{agent.errors.length === 1 ? '' : 's'} · {agent.errors[0]}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-slate-500">
                    No active source errors · polled {new Date(agent.polledAt).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {themis?.sourceStatus ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
              <span className="font-medium text-slate-200">THEMIS readout:</span>{' '}
              Governance transparency is now rendered with explicit source-state visibility, so catalog failures, keyed fallbacks, and cached snapshots become operator-visible instead of silent.
            </div>
          ) : null}
        </div>
      ) : null}

      {eveLedger.length > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-rose-300/90">
              EVE synthesis · civic ledger
            </div>
            <div className="text-[10px] font-mono text-slate-500">{eveLedger.length} recent</div>
          </div>
          <div className="mt-3 space-y-2">
            {eveLedger.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2"
              >
                <div className="text-[10px] font-mono text-slate-500">{row.id}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-1">
                  <div className="text-sm font-semibold text-slate-100">{row.title}</div>
                  {row.source === 'eve-synthesis' ? (
                    <span className="text-[10px] font-mono text-rose-400 border border-rose-400/30 rounded px-1 py-0.5 ml-1">
                      EVE SYN
                    </span>
                  ) : null}
                </div>
                {row.body?.trim() ? (
                  <div className="mt-1 line-clamp-2 text-xs text-slate-400">{row.body}</div>
                ) : null}
                <div className="mt-1 text-[10px] font-mono text-slate-500">{row.timestamp}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {signals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-400">
            <div className="font-medium text-slate-200">No live pulse items yet.</div>
            <div className="mt-1 text-xs text-slate-500">
              The intake lane is waiting for new signals from the active agent network.
            </div>
          </div>
        ) : null}

        {signals.map((signal) => (
          <div key={signal.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  {signal.source_agent} • {signal.category}
                </div>
                <div className="mt-1 text-sm font-semibold text-white">{signal.title}</div>
              </div>

              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-300">
                {signal.status}
              </div>
            </div>

            <div className="mt-2 text-sm text-slate-300">{signal.summary}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              {signal.tags.map((tag) => (
                <span
                  key={`${signal.id}-${tag}`}
                  className="rounded-md bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Confidence {signal.confidence_tier} · Observed {new Date(signal.observed_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      {degraded ? (
        <div className="mt-3 text-xs text-amber-300">
          Showing mock/cached data — live source offline
        </div>
      ) : null}
    </div>
  );
}
