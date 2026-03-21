import type { PublicEpiconRecord } from '@/lib/epicon/feedStore';

function statusTone(status: PublicEpiconRecord['status']) {
  switch (status) {
    case 'verified':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'contradicted':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    case 'developing':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    default:
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
}

export default function EpiconFeedCard({
  item,
}: {
  item: PublicEpiconRecord;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {item.id}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{item.title}</div>
        </div>

        <div
          className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${statusTone(
            item.status,
          )}`}
        >
          {item.status}
        </div>
      </div>

      <div className="mt-3 text-sm text-slate-300">{item.summary}</div>

      <div className="mt-3 flex flex-wrap gap-2">
        {item.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
        <div>
          <span className="text-slate-500">Confidence:</span>{' '}
          {item.confidence_tier}
        </div>
        <div>
          <span className="text-slate-500">Stake:</span> {item.mic_stake} MIC
        </div>
        <div>
          <span className="text-slate-500">By:</span>{' '}
          @{item.submitted_by_login || 'unknown'}
        </div>
        <div>
          <span className="text-slate-500">Agents:</span>{' '}
          {item.agents_used.join(', ')}
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        {new Date(item.created_at).toLocaleString()}
      </div>
    </div>
  );
}
