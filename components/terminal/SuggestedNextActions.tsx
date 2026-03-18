'use client';

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
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs font-mono font-semibold uppercase tracking-[0.2em] text-sky-300">
        {title}
      </div>
      <div className="mt-1 text-sm font-sans text-slate-400">
        Keep operators in motion with the most likely follow-on steps.
      </div>

      <div className="mt-4 grid gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onSelect?.(action.id)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-left transition hover:border-slate-700 hover:bg-slate-900"
          >
            <div className="text-sm font-sans font-medium text-white">{action.label}</div>
            <div className="mt-1 text-xs font-sans text-slate-400">{action.description}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
