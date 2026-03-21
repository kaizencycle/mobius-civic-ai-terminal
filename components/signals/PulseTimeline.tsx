'use client';

import { useEffect, useState } from 'react';

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
  last_run: string;
  freshness: {
    status: 'fresh' | 'degraded' | 'stale';
    seconds: number;
  };
};

function freshnessLabel(runtime: RuntimeStatus | null) {
  if (runtime?.freshness.status === 'fresh') return 'System live';
  if (runtime?.freshness.status === 'degraded') return 'System degraded';
  if (runtime?.freshness.status === 'stale') return 'System stale';
  return 'Checking system freshness';
}

function freshnessTone(runtime: RuntimeStatus | null) {
  if (runtime?.freshness.status === 'fresh') return 'text-emerald-300';
  if (runtime?.freshness.status === 'degraded') return 'text-amber-300';
  if (runtime?.freshness.status === 'stale') return 'text-rose-300';
  return 'text-slate-500';
}

export default function PulseTimeline() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);

  async function load() {
    const pulseRes = await fetch('/api/signals/pulse', { cache: 'no-store' });
    const pulseJson = await pulseRes.json();
    const runtimeRes = await fetch('/api/runtime/status', { cache: 'no-store' });
    const runtimeJson: RuntimeStatus = await runtimeRes.json();
    setSignals(pulseJson.signals || []);
    setRuntime(runtimeJson);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={`text-xs uppercase tracking-[0.18em] ${freshnessTone(runtime)}`}>{freshnessLabel(runtime)}</div>
          <div className="mt-2 text-sm text-slate-400">
            Incoming micro-agent signals and current intake state.
          </div>
        </div>

        <div className="text-right text-xs text-slate-500">
          <div>{runtime?.last_run ? `Updated ${new Date(runtime.last_run).toLocaleString()}` : 'Awaiting heartbeat'}</div>
          <div>{signals.length} active signals</div>
        </div>
      </div>

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
    </div>
  );
}
