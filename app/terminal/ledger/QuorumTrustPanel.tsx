'use client';

import { useEffect, useState } from 'react';

type QuorumCluster = {
  key: string;
  entries: number;
  agents: string[];
  averageTrust: number;
  quorumScore: number;
  authorized?: boolean;
  authorizationReason?: string;
};

type QuorumTrustResponse = {
  ok: boolean;
  count?: number;
  top?: QuorumCluster[];
  error?: string;
  timestamp?: string;
};

function scoreTone(score: number): string {
  if (score >= 0.75) return 'border-emerald-700/40 bg-emerald-950/20 text-emerald-200';
  if (score >= 0.55) return 'border-cyan-700/40 bg-cyan-950/20 text-cyan-200';
  if (score > 0) return 'border-amber-700/40 bg-amber-950/20 text-amber-200';
  return 'border-rose-700/40 bg-rose-950/20 text-rose-200';
}

export default function QuorumTrustPanel() {
  const [data, setData] = useState<QuorumTrustResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/agents/quorum-trust', { cache: 'no-store' });
        const json = (await res.json()) as QuorumTrustResponse;
        if (!cancelled) setData(json);
      } catch (error) {
        if (!cancelled) {
          setData({ ok: false, error: error instanceof Error ? error.message : 'quorum_trust_fetch_failed' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const clusters = data?.top ?? [];

  return (
    <section className="mb-3 rounded border border-slate-800 bg-slate-950/50 p-3 text-[11px] text-slate-300">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Quorum Trust</div>
          <div className="text-slate-500">Consensus-weighted truth clusters from ledger history.</div>
        </div>
        <span className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 font-mono text-[10px] text-slate-400">
          {loading ? 'loading' : data?.ok ? `${data.count ?? clusters.length} clusters` : 'degraded'}
        </span>
      </div>

      {data?.ok === false ? (
        <div className="rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-amber-200">
          ⚠ Quorum trust unavailable: {data.error ?? 'unknown error'}
        </div>
      ) : null}

      {data?.ok && clusters.length === 0 ? (
        <div className="rounded border border-slate-800 bg-slate-900/40 px-2 py-1 text-slate-500">
          No quorum clusters available yet.
        </div>
      ) : null}

      {clusters.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {clusters.slice(0, 6).map((cluster) => (
            <div key={cluster.key} className={`rounded border px-2 py-2 ${scoreTone(cluster.quorumScore)}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px]" title={cluster.key}>{cluster.key}</span>
                <span className="font-mono text-[10px]">Q {cluster.quorumScore.toFixed(2)}</span>
              </div>
              <div className="flex flex-wrap gap-1 text-[9px] text-slate-400">
                <span>avg {cluster.averageTrust.toFixed(2)}</span>
                <span>entries {cluster.entries}</span>
                <span>agents {cluster.agents.length}</span>
                {typeof cluster.authorized === 'boolean' ? <span>{cluster.authorized ? 'authorized' : 'blocked'}</span> : null}
              </div>
              <div className="mt-1 truncate text-[9px] text-slate-500" title={cluster.agents.join(', ')}>
                {cluster.agents.join(' · ')}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
