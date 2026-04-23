'use client';

/**
 * SuggestedNextActions — Compact horizontal action pills.
 */

export type SuggestedAction = {
  id: string;
  label: string;
  description: string;
};

export default function SuggestedNextActions({
  title = 'Suggested Next Actions',
  actions,
  onSelect,
}: {
  title?: string;
  actions: SuggestedAction[];
  onSelect?: (actionId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
          {title}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onSelect?.(action.id)}
              title={action.description}
              className="rounded-md border border-slate-700/60 bg-slate-950/80 px-2.5 py-1 text-[11px] font-mono text-slate-300 transition hover:border-sky-500/30 hover:bg-sky-500/5 hover:text-sky-300"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
