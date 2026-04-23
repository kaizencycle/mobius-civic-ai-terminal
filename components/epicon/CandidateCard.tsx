'use client';

type Candidate = {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: 'pending' | 'verified' | 'contradicted' | 'pending-verification' | 'contested';
  confidence_tier: number;
  external_source_system?: string;
  external_source_actor?: string;
  zeus_note?: string;
  sources?: string[];
  trace: string[];
  promoted_epicon_id?: string;
  promoted_ledger_entry_id?: string;
  promotion_state?: 'pending' | 'promoted' | 'not_promoted';
};

type Props = {
  item: Candidate;
  onVerify: (id: string, outcome: 'verified' | 'contradicted') => Promise<void>;
  canVerify: boolean;
  canContradict: boolean;
  pipelineManaged?: boolean;
};

function tone(status: Candidate['status']) {
  switch (status) {
    case 'verified':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'contradicted':
    case 'contested':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    default:
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
}

export default function CandidateCard({
  item,
  onVerify,
  canVerify,
  canContradict,
  pipelineManaged = false,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-800 bg-black/40 p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs opacity-60">
            {item.external_source_system} | {item.category}
          </div>
          <div className="font-semibold">{item.title}</div>
        </div>

        <div
          className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${tone(item.status)}`}
        >
          {item.status}
        </div>
      </div>

      <div className="mt-2 text-sm opacity-80">{item.summary}</div>

      <div className="mt-3 text-xs opacity-50">
        confidence: {item.confidence_tier}
      </div>

      {item.external_source_actor ? (
        <div className="mt-2 text-xs opacity-60">
          actor: {item.external_source_actor}
        </div>
      ) : null}

      {item.sources?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.sources.slice(0, 3).map((source) => (
            <span
              key={source}
              className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-400"
            >
              {source}
            </span>
          ))}
        </div>
      ) : null}

      {item.zeus_note ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
          ZEUS: {item.zeus_note}
        </div>
      ) : null}

      {item.promoted_epicon_id ? (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-300">
          Promoted to factual EPICON path as {item.promoted_epicon_id}
          {item.promoted_ledger_entry_id ? ` | ledger ${item.promoted_ledger_entry_id}` : ''}
        </div>
      ) : null}

      {item.status === 'contradicted' ? (
        <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-xs text-rose-300">
          Contradicted candidates remain explicit review outcomes and are not promoted into factual EPICON/ledger records.
        </div>
      ) : null}

      {item.status === 'pending' ? (
        <div className="mt-4 flex gap-2">
          <button
            disabled={!canVerify}
            onClick={() => onVerify(item.id, 'verified')}
            className={`rounded-lg border px-3 py-2 text-xs transition ${
              canVerify
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600'
            }`}
          >
            ZEUS Verify
          </button>
          <button
            disabled={!canContradict}
            onClick={() => onVerify(item.id, 'contradicted')}
            className={`rounded-lg border px-3 py-2 text-xs transition ${
              canContradict
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                : 'cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600'
            }`}
          >
            ZEUS Contradict
          </button>
        </div>
      ) : null}

      {item.status === 'pending' && !pipelineManaged && !canVerify && !canContradict ? (
        <div className="mt-3 text-xs text-slate-500">
          Verification unavailable for current role
        </div>
      ) : null}
    </div>
  );
}
