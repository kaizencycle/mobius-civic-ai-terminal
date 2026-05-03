'use client';

import { useMemo, useState } from 'react';

type EpiconStance = 'support' | 'oppose' | 'conditional';
type EpiconStatus = 'pass' | 'needs_clarification' | 'fail';

type EpiconCheckResponse = {
  status: EpiconStatus;
  ecs: number;
  vote: {
    support: number;
    conditional: number;
    oppose: number;
  };
  quorum: {
    agents: number;
    min_required: number;
    independent_ok: boolean;
  };
  dissent: Array<{
    agent: string;
    stance: EpiconStance;
    reason: string;
  }>;
};

type EpiconCheckError = { error?: string };

function isEpiconCheckResponse(payload: EpiconCheckResponse | EpiconCheckError): payload is EpiconCheckResponse {
  return (
    typeof (payload as EpiconCheckResponse).status === 'string' &&
    typeof (payload as EpiconCheckResponse).ecs === 'number' &&
    Boolean((payload as EpiconCheckResponse).vote) &&
    Boolean((payload as EpiconCheckResponse).quorum) &&
    Array.isArray((payload as EpiconCheckResponse).dissent)
  );
}

const SAMPLE_REPORTS = ['ATLAS', 'ZEUS', 'EVE', 'AUREA', 'JADE'].map((agent) => ({
  agent,
  stance: 'support' as const,
  confidence: 0.9,
  ej: {
    reasoning: `${agent} supports the action for a low-risk EPICON runtime visibility check.`,
    anchors: ['EPICON-01 EJ', 'EPICON-03 quorum'],
    counterfactuals: ['If any agent opposed, action would not be considered pass.'],
    ccr_score: 0.8,
    css_pass: true,
  },
  ej_hash: `sha256:${agent.toLowerCase()}-sample`,
  generated_at: new Date().toISOString(),
}));

const STATUS_CLASS: Record<EpiconStatus, string> = {
  pass: 'text-emerald-300 border-emerald-500/30 bg-emerald-950/20',
  needs_clarification: 'text-amber-300 border-amber-500/30 bg-amber-950/20',
  fail: 'text-rose-300 border-rose-500/30 bg-rose-950/20',
};

export default function EpiconPage() {
  const [result, setResult] = useState<EpiconCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consensusLabel = useMemo(() => {
    if (!result) return 'not_checked';
    return `${result.status.toUpperCase()} · ECS ${result.ecs.toFixed(2)}`;
  }, [result]);

  async function runSampleCheck() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/epicon/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: SAMPLE_REPORTS }),
      });
      const payload = (await response.json()) as EpiconCheckResponse | EpiconCheckError;
      if (!response.ok || !isEpiconCheckResponse(payload)) {
        throw new Error('error' in payload ? payload.error ?? 'epicon_check_failed' : 'epicon_check_failed');
      }
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'epicon_check_failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-slate-200">
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Mobius Governance</div>
        <h1 className="mt-1 text-lg font-semibold uppercase tracking-[0.16em] text-violet-200">EPICON Runtime</h1>
        <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-500">
          Runtime visibility for intent, epistemic justification, consensus scoring, and dissent preservation. This panel observes EPICON-03; it does not enforce mutation blocking yet.
        </p>
      </div>

      <section className="mb-4 rounded border border-violet-500/25 bg-slate-950/80 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-violet-300/80">Consensus Check</div>
            <div className="mt-1 text-slate-400">Sample Sentinel quorum: ATLAS · ZEUS · EVE · AUREA · JADE</div>
          </div>
          <button
            type="button"
            onClick={runSampleCheck}
            disabled={loading}
            className="rounded border border-cyan-500/40 px-3 py-1 text-cyan-200 hover:border-cyan-300 disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Run Sample EPICON Check'}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded border border-slate-800 bg-black/20 p-3">
            <div className="text-slate-500">status</div>
            <div className={result ? `mt-1 inline-block rounded border px-2 py-1 ${STATUS_CLASS[result.status]}` : 'mt-1 text-slate-400'}>{consensusLabel}</div>
          </div>
          <div className="rounded border border-slate-800 bg-black/20 p-3">
            <div className="text-slate-500">quorum</div>
            <div className="mt-1 text-slate-100">{result ? `${result.quorum.agents}/${result.quorum.min_required}` : '—'}</div>
          </div>
          <div className="rounded border border-slate-800 bg-black/20 p-3">
            <div className="text-slate-500">support</div>
            <div className="mt-1 text-emerald-300">{result?.vote.support ?? '—'}</div>
          </div>
          <div className="rounded border border-slate-800 bg-black/20 p-3">
            <div className="text-slate-500">dissent</div>
            <div className="mt-1 text-rose-300">{result?.dissent.length ?? '—'}</div>
          </div>
        </div>

        {error ? <div className="mt-3 rounded border border-rose-500/30 bg-rose-950/20 p-2 text-rose-200">{error}</div> : null}
      </section>

      <section className="rounded border border-slate-800 bg-slate-950/70 p-4 text-[11px] text-slate-400">
        <div className="mb-2 uppercase tracking-[0.18em] text-cyan-300/80">Runtime Law</div>
        <div>EPICON-01 preserves meaning through EJ.</div>
        <div>EPICON-02 preserves intent before action.</div>
        <div>EPICON-03 preserves consensus and dissent before authority.</div>
        <div className="mt-3 text-amber-300">Current mode: observe-only. Enforcement begins in the next phase.</div>
      </section>
    </div>
  );
}
