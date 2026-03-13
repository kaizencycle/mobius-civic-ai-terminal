import type { EpiconItem } from '@/lib/terminal/types';
import { confidenceLabel, epiconStatusStyle, cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

export default function EpiconFeedPanel({
  items,
  selectedId,
  onSelect,
}: {
  items: EpiconItem[];
  selectedId: string;
  onSelect: (item: EpiconItem) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel title="EPICON Feed" subtitle="Live audited event stream" />
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={cn(
              'w-full rounded-lg border p-4 text-left transition',
              selectedId === item.id
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-mono font-medium uppercase tracking-[0.2em] text-slate-400">
                  {item.id}
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {item.title}
                </div>
                <div className="mt-2 text-sm font-sans text-slate-300">
                  {item.summary}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <span
                  className={cn(
                    'rounded-md border px-2 py-1 text-[10px] font-mono font-medium uppercase tracking-[0.15em]',
                    epiconStatusStyle(item.status),
                  )}
                >
                  {item.status}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {item.timestamp}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-300">
                {item.category}
              </span>
              <span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-300">
                {confidenceLabel(item.confidenceTier)}
              </span>
              <span className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-300">
                {item.ownerAgent}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
