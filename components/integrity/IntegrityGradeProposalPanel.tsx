'use client';

import { useCallback, useEffect, useState } from 'react';

type GradeRequestPublic = {
  ok: boolean;
  proposal_only: true;
  minting_enabled: false;
  request: {
    request_id: string;
    wallet_id: string;
    portfolio_root_hash: string;
    fountain_state: string;
    status: string;
  };
  reviews: Record<string, string>;
  human_review: string;
  result: {
    status: string;
    recognition: { mic: number; status?: string };
    review: Record<string, string>;
  } | null;
  created_at: string;
  updated_at: string;
};

type ListResponse = {
  ok: boolean;
  proposal_only: true;
  minting_enabled: false;
  requests: GradeRequestPublic[];
  count: number;
};

const DEMO_HASH =
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const SENTINELS = ['atlas', 'zeus', 'eve', 'jade', 'aurea'] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'RECOGNITION_PENDING':
    case 'STEWARDSHIP_VERIFIED':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    case 'QUARANTINED':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
    case 'NEEDS_MORE_EVIDENCE':
    case 'CLARIFY':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
    default:
      return 'border-slate-600 bg-slate-800/50 text-slate-200';
  }
}

export function IntegrityGradeProposalPanel({ walletId }: { walletId?: string }) {
  const [requests, setRequests] = useState<GradeRequestPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [portfolioHash, setPortfolioHash] = useState(DEMO_HASH);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/integrity/grade/requests', { cache: 'no-store' });
      const j = (await r.json()) as ListResponse & { error?: string };
      if (!r.ok || !j.ok) {
        setErr(j.error ?? `HTTP ${r.status}`);
        return;
      }
      setRequests(j.requests);
    } catch {
      setErr('Unable to load Integrity Grade requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function submitRequest() {
    if (!walletId) {
      setErr('Login required to propose Integrity Grade review');
      return;
    }
    if (!consent) {
      setErr('Portfolio review consent is required');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch('/api/integrity/grade/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_id: walletId,
          portfolio_root_hash: portfolioHash,
          consent_granted: true,
        }),
      });
      const j = (await r.json()) as GradeRequestPublic & { error?: string };
      if (!r.ok || !j.ok) {
        setErr(j.error ?? `HTTP ${r.status}`);
        return;
      }
      await loadRequests();
      setConsent(false);
    } catch {
      setErr('Failed to create Integrity Grade request');
    } finally {
      setSubmitting(false);
    }
  }

  async function recordReview(requestId: string, agent: string, verdict: string) {
    setErr(null);
    try {
      const r = await fetch(`/api/integrity/grade/requests/${encodeURIComponent(requestId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, verdict }),
      });
      const j = (await r.json()) as GradeRequestPublic & { error?: string };
      if (!r.ok || !j.ok) {
        setErr(j.error ?? `HTTP ${r.status}`);
        return;
      }
      await loadRequests();
    } catch {
      setErr('Failed to record review');
    }
  }

  return (
    <div className="mt-4 rounded border border-violet-500/25 bg-slate-950/80 p-4 font-mono text-xs text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-violet-300/90">
          Integrity Grade · proposal-only (C-369)
        </div>
        <div className="flex gap-2 text-[9px]">
          <span className="rounded border border-violet-500/30 px-1.5 py-0.5 text-violet-300">proposal_only</span>
          <span className="rounded border border-slate-600 px-1.5 py-0.5 text-slate-400">no mint</span>
        </div>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        MFS proves capability. MIC recognizes stewardship. This surface records review proposals only — no automatic MIC issuance, sealing, or Reserve Block allocation.
      </p>

      {err ? (
        <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-200">
          {err}
        </div>
      ) : null}

      <div className="mt-3 space-y-2 rounded border border-slate-700/60 bg-slate-900/40 p-3">
        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Propose portfolio review</div>
        <input
          type="text"
          value={portfolioHash}
          onChange={(e) => setPortfolioHash(e.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200"
          placeholder="sha256:…"
        />
        <label className="flex items-center gap-2 text-[10px] text-slate-400">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="rounded"
          />
          I consent to portfolio review (scope: portfolio_review)
        </label>
        <button
          type="button"
          onClick={() => void submitRequest()}
          disabled={submitting || !walletId}
          className="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200 disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : walletId ? 'Submit proposal' : 'Login to submit'}
        </button>
      </div>

      {loading ? (
        <div className="mt-3 animate-pulse text-[10px] text-slate-500">Loading requests…</div>
      ) : requests.length === 0 ? (
        <div className="mt-3 text-[10px] text-slate-500">No Integrity Grade proposals yet.</div>
      ) : (
        <div className="mt-3 space-y-3">
          {requests.map((entry) => (
            <div key={entry.request.request_id} className="rounded border border-slate-700/50 bg-slate-900/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] text-slate-300">{entry.request.request_id}</span>
                {entry.result ? (
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 text-[9px] font-semibold ${statusBadgeClass(entry.result.status)}`}
                  >
                    {entry.result.status}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-[9px] text-slate-500">
                wallet {entry.request.wallet_id} · fountain {entry.request.fountain_state}
              </div>
              <div className="mt-1 text-[9px] text-slate-500 truncate">
                {entry.request.portfolio_root_hash}
              </div>
              {entry.result ? (
                <div className="mt-2 text-[9px] text-slate-400">
                  MIC recognition: {entry.result.recognition.mic} · human: {entry.human_review}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {SENTINELS.map((agent) => (
                  <button
                    key={agent}
                    type="button"
                    onClick={() => void recordReview(entry.request.request_id, agent, 'pass')}
                    className="rounded border border-slate-700 px-1.5 py-0.5 text-[8px] text-slate-400 hover:border-emerald-500/40 hover:text-emerald-300"
                  >
                    {agent} pass
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void recordReview(entry.request.request_id, 'human', 'approved')}
                  className="rounded border border-slate-700 px-1.5 py-0.5 text-[8px] text-slate-400 hover:border-violet-500/40 hover:text-violet-300"
                >
                  human approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
