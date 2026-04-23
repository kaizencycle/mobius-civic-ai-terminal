'use client';

/** Match `journal-ATLAS-C-285-9691` inside a longer substrate ref. */
const JOURNAL_SUBSTRING = /journal-[A-Za-z0-9-]+/i;
/** Short-form cron id e.g. `ATLAS-C-285-1776531745478`. */
const SHORT_FORM = /^[A-Z]{2,12}-C-\d+-\d+$/i;

export function extractJournalEntryIdForNav(ref: string): string | null {
  const t = ref.trim();
  if (!t) return null;
  const embedded = t.match(JOURNAL_SUBSTRING);
  if (embedded) return embedded[0];
  if (SHORT_FORM.test(t)) return t;
  if (t.startsWith('journal-')) return t;
  return null;
}

type Props = {
  items: string[] | undefined;
  onJournalRefClick?: (journalEntryId: string) => void;
};

export default function DerivedFromChain({ items, onJournalRefClick }: Props) {
  const list = (items ?? []).filter((s) => typeof s === 'string' && s.trim().length > 0);
  if (list.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Derived from</div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((ref) => {
          const navId = extractJournalEntryIdForNav(ref);
          const clickable = Boolean(onJournalRefClick) && navId !== null;
          const base =
            'max-w-full truncate rounded border px-2 py-0.5 font-mono text-[10px] transition ' +
            (clickable
              ? 'cursor-pointer border-violet-500/40 bg-violet-500/10 text-violet-100 hover:border-violet-400/60 hover:bg-violet-500/15'
              : 'cursor-default border-slate-700 bg-slate-900/80 text-slate-400');
          return (
            <button
              key={ref}
              type="button"
              disabled={!clickable}
              title={clickable ? `Scroll to ${navId}` : ref}
              onClick={() => clickable && navId && onJournalRefClick?.(navId)}
              className={base}
            >
              {ref}
            </button>
          );
        })}
      </div>
    </div>
  );
}
