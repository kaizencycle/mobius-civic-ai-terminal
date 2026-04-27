'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// (existing types unchanged above… omitted for brevity in patch reasoning)

// ADD NEW TYPES
type ReplayMutationView = {
  loading: boolean;
  plan: any | null;
  receipt: any | null;
};

// (keep existing code… inject new panel below ReplayCouncilPanel)

// Inside component:
// ADD STATE
const [mutationView, setMutationView] = useState<ReplayMutationView>({ loading: false, plan: null, receipt: null });

// ADD EFFECT
useEffect(() => {
  if (!selectedSealId) return;
  setMutationView((v) => ({ ...v, loading: true }));
  fetch(`/api/system/replay/mutation?seal_id=${encodeURIComponent(selectedSealId)}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => setMutationView({ loading: false, plan: data.plan, receipt: data.receipt }))
    .catch(() => setMutationView({ loading: false, plan: null, receipt: null }));
}, [selectedSealId]);

// ADD PANEL COMPONENT INLINE
function MutationPanel({ view }: { view: ReplayMutationView }) {
  return (
    <section className="rounded border border-cyan-500/25 bg-slate-950/70 p-4">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">Mutation Layer</div>
      {view.loading && <div className="text-[10px] text-slate-500">Loading mutation state…</div>}

      {view.plan && (
        <div className="mb-2 text-[10px] text-slate-400">
          <div>plan: <span className="text-cyan-200">{view.plan.mutation_kind}</span></div>
          <div>effect: <span className="text-cyan-200">{view.plan.proposed_effect}</span></div>
          <div>history_preserved: <span className="text-emerald-300">true</span></div>
        </div>
      )}

      {view.receipt && (
        <div className="text-[10px] text-slate-400">
          <div>status: <span className="text-emerald-300">{view.receipt.status}</span></div>
          <div>executed: <span className="text-cyan-200">{new Date(view.receipt.executed_at).toLocaleString()}</span></div>
          <div>executor: <span className="text-cyan-200">{view.receipt.executor}</span></div>
        </div>
      )}

      {!view.plan && !view.receipt && !view.loading && (
        <div className="text-[10px] text-slate-500">No mutation plan or receipt recorded.</div>
      )}
    </section>
  );
}

// THEN RENDER UNDER COUNCIL PANEL:
// <MutationPanel view={mutationView} />
