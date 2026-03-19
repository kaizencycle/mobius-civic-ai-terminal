'use client';

type Candidate = {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: 'pending' | 'verified' | 'contradicted';
  confidence_tier: number;
  external_source_system?: string;
  zeus_note?: string;
};

type Props = {
  item: Candidate;
  onVerify: (id: string, outcome: 'verified' | 'contradicted') => Promise<void>;
};

function tone(status: Candidate['status']) {
  switch (status) {
    case 'verified':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'contradicted':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    default:
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
}

export default function CandidateCard({ item, onVerify }: Props) {
  return (
    <div className="rounded-xl border border-slate-800 bg-black/40 p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs opacity-60">
            {item.external_source_system} • {item.category}
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

      {item.zeus_note ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
          ZEUS: {item.zeus_note}
        </div>
      ) : null}

      {item.status === 'pending' ? (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onVerify(item.id, 'verified')}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20"
          >
            ZEUS Verify
          </button>
          <button
            onClick={() => onVerify(item.id, 'contradicted')}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20"
          >
            ZEUS Contradict
          </button>
        </div>
      ) : null}
    </div>
  );
}
