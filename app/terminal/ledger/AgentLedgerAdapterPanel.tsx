'use client';

import { useEffect, useMemo, useState } from 'react';

type AgentLedgerAdapterSummary = {
  total: number;
  eligible: number;
  blocked: number;
  by_agent: Record<string, { total: number; eligible: number; blocked: number }>;
};

type AgentLedgerAdapterPreview = {
  journal_id: string;
  agent: string;
  cycle: string;
  timestamp: string;
  decision: {
    eligible: boolean;
    reason: string;
    proofSource: string;
    canonState: string;
    status: string;
    integrityDelta: number;
  };
  ledger_entry: {
    id: string;
    title?: string;
    summary: string;
    status: string;
    canonState?: string;
    confidenceTier?: number;
  };
};

type AgentLedgerAdapterResponse = {
  ok: boolean;
  readonly: true;
  version: string;
  summary: AgentLedgerAdapterSummary;
  count: number;
  previews: AgentLedgerAdapterPreview[];
  timestamp: string;
};

function agentText(agent: string): string {
  const upper = agent.toUpperCase();
  if (upper === 'ATLAS') return 'text-cyan-300';
  if (upper === 'ZEUS') return 'text-yellow-300';
  if (upper === 'AUREA') return 'text-amber-300';
  if (upper === 'JADE') return 'text-emerald-300';
  if (upper === 'HERMES') return 'text-rose-300';
  if (upper === 'EVE') return 'text-violet-300';
  return 'text-slate-200';
}

function statusClass(eligible: boolean): string {
  return eligible
    ? 'border-emerald-700/40 bg-emerald-950/20 text-emerald-200'
    : 'border-slate-700 bg-slate-950/50 text-slate-400';
}

export default function AgentLedgerAdapterPanel({ activeCycle }: { activeCycle: string }) {
  const [data, setData] = useState<AgentLedgerAdapterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = `/api/agents/ledger-adapter?mode=merged&limit=50&cycle=${encodeURIComponent(activeCycle)}`;
    void fetch(url, { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as AgentLedgerAdapterResponse;
        if (!response.ok || !payload.ok) throw new Error('agent_ledger_adapter_fetch_failed');
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'adapter_fetch_failed');
      });
    return () => {
      cancelled = true;
    };
  }, [activeCycle]);

  const rows = useMemo(() => {
    const previews = data?.previews ?? [];
    const sorted = [...previews].sort((a, b) => Number(b.decision.eligible) - Number(a.decision.eligible));
    return showAll ? sorted : sorted.slice(0, 6);
  }, [data, showAll]);

  if (error) {
    return (
      <div className="mb-3 rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">
        Agent ledger adapter preview unavailable: {error}. Ledger rows remain authoritative.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mb-3 rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-500">
        Loading multi-agent ledger adapter preview…
      </div>
    );
  }

  const agents = Object.entries(data.summary.by_agent).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mb-3 rounded border border-violet-700/30 bg-violet-950/10 px-3 py-2 text-[11px] text-slate-400">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono uppercase tracking-[0.14em] text-violet-200">Multi-Agent Ledger Adapter</div>
          <div className="mt-0.5 text-slate-500">Read-only preview · journal → eligible ledger candidates · no writes from UI</div>
        </div>
        <div className="flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.08em]">
          <span className="rounded border border-slate-700 bg-slate-950/50 px-2 py-1">total {data.summary.total}</span>
          <span className="rounded border border-emerald-700/40 bg-emerald-950/20 px-2 py-1 text-emerald-200">eligible {data.summary.eligible}</span>
          <span className="rounded border border-slate-700 bg-slate-950/50 px-2 py-1">blocked {data.summary.blocked}</span>
        </div>
      </div>

      {agents.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
          {agents.map(([agent, stats]) => (
            <span key={agent} className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1">
              <span className={agentText(agent)}>{agent}</span> {stats.eligible}/{stats.total}
            </span>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-2 text-slate-500">
          No adapter candidates found for {activeCycle}.
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((preview) => (
            <div key={preview.journal_id} className="grid gap-2 rounded border border-slate-800 bg-slate-950/50 px-2 py-2 md:grid-cols-[70px_80px_1fr_110px]">
              <span className={`font-mono text-[10px] ${agentText(preview.agent)}`}>{preview.agent}</span>
              <span className={`w-fit rounded border px-1.5 py-0.5 font-mono text-[9px] ${statusClass(preview.decision.eligible)}`}>
                {preview.decision.eligible ? 'eligible' : 'blocked'}
              </span>
              <span className="truncate text-slate-300" title={preview.ledger_entry.title ?? preview.ledger_entry.summary}>
                {preview.ledger_entry.title ?? preview.ledger_entry.summary}
              </span>
              <span className="truncate text-slate-500" title={preview.decision.reason}>{preview.decision.reason}</span>
            </div>
          ))}
        </div>
      )}

      {(data.previews?.length ?? 0) > 6 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-2 rounded border border-slate-700 px-2 py-1 font-mono text-[10px] text-slate-400 hover:border-violet-500/50 hover:text-violet-200"
        >
          {showAll ? 'show less' : `show all ${data.previews.length}`}
        </button>
      ) : null}
    </div>
  );
}
