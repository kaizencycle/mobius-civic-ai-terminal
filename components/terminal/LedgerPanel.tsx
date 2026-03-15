import type { LedgerEntry } from '@/lib/terminal/types';
import { cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

const TYPE_STYLES: Record<LedgerEntry['type'], string> = {
  epicon: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  attestation: 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10',
  shard: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  ubi: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  settlement: 'text-slate-300 border-slate-500/30 bg-slate-500/10',
};

const STATUS_STYLES: Record<LedgerEntry['status'], string> = {
  committed: 'text-emerald-300',
  pending: 'text-amber-300',
  reverted: 'text-red-300',
};

export default function LedgerPanel({
  entries,
  selectedId,
  onSelect,
}: {
  entries: LedgerEntry[];
  selectedId?: string;
  onSelect?: (entry: LedgerEntry) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Civic Ledger"
        subtitle="Immutable event record — Mobius Substrate"
      />
      <div className="mt-3 space-y-2">
        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onSelect?.(entry)}
            className={cn(
              'w-full rounded-lg border p-3 text-left transition',
              selectedId === entry.id
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">
                    {entry.id}
                  </span>
                  <span
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em]',
                      TYPE_STYLES[entry.type],
                    )}
                  >
                    {entry.type}
                  </span>
                </div>
                <div className="mt-1 text-sm font-sans text-slate-200 truncate">
                  {entry.summary}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[10px] font-mono text-slate-500">
                  {entry.timestamp}
                </div>
                <div className={cn('mt-1 text-[10px] font-mono uppercase', STATUS_STYLES[entry.status])}>
                  {entry.status}
                </div>
                {entry.integrityDelta !== 0 && (
                  <div
                    className={cn(
                      'mt-1 text-[10px] font-mono',
                      entry.integrityDelta > 0 ? 'text-emerald-300' : 'text-red-300',
                    )}
                  >
                    {entry.integrityDelta > 0 ? '+' : ''}
                    {entry.integrityDelta.toFixed(3)} GI
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-300">
                {entry.agentOrigin}
              </span>
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-300">
                {entry.cycleId}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
