'use client';

import type { EpiconItem, LedgerEntry } from '@/lib/terminal/types';
import { cn } from '@/lib/terminal/utils';

export type ReplayAction = {
  id: string;
  label: string;
  note: string;
};

function statusTone(status: EpiconItem['status']) {
  if (status === 'verified') return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10';
  if (status === 'contradicted') return 'text-rose-300 border-rose-500/20 bg-rose-500/10';
  return 'text-amber-300 border-amber-500/20 bg-amber-500/10';
}

export default function AttestationReplayRail({
  event,
  relatedLedger,
  onAction,
}: {
  event: EpiconItem;
  relatedLedger?: LedgerEntry;
  onAction?: (actionId: string) => void;
}) {
  const confidenceProgression = Array.from({ length: 5 }, (_, idx) => idx <= event.confidenceTier);
  const actions: ReplayAction[] = [
    { id: 'replay', label: 'Replay', note: 'Re-run the attestation path from intake to ledger.' },
    { id: 'challenge', label: 'Challenge', note: 'Open a contradiction lane for operator review.' },
    { id: 'compare', label: 'Compare', note: 'Cross-check this EPICON against related shards and alerts.' },
  ];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono font-semibold uppercase tracking-[0.2em] text-sky-300">
            Attestation Replay Rail
          </div>
          <div className="mt-1 text-sm font-sans text-slate-400">
            Drill down from signal intake to ledger anchoring for the selected EPICON.
          </div>
        </div>
        <span className={cn('rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em]', statusTone(event.status))}>
          {event.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-slate-500">source stack</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {event.sources.map((source) => (
              <span key={source} className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-300">
                {source}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-slate-500">verification owner</div>
          <div className="mt-2 text-sm font-sans text-slate-200">{event.ownerAgent}</div>
          <div className="mt-3 text-[11px] font-mono uppercase tracking-[0.15em] text-slate-500">ledger write</div>
          <div className="mt-1 text-sm font-sans text-slate-300">
            {relatedLedger ? `${relatedLedger.status.toUpperCase()} · ${relatedLedger.id}` : 'Awaiting correlated ledger entry'}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-slate-500">confidence progression</div>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {confidenceProgression.map((active, idx) => (
            <div
              key={idx}
              className={cn(
                'rounded-md border px-2 py-2 text-center text-[11px] font-mono uppercase tracking-[0.12em]',
                active
                  ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                  : 'border-slate-800 bg-slate-900 text-slate-500',
              )}
            >
              T{idx}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-slate-500">agent handoff trace</div>
        <div className="mt-2 space-y-2">
          {event.trace.map((step, index) => (
            <div key={`${event.id}-${index}`} className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
              <span className="mr-2 font-mono text-slate-500">{String(index + 1).padStart(2, '0')}</span>
              {step}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction?.(action.id)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-left transition hover:border-slate-700 hover:bg-slate-900"
          >
            <div className="text-xs font-mono uppercase tracking-[0.15em] text-sky-300">{action.label}</div>
            <div className="mt-1 text-xs font-sans text-slate-400">{action.note}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
