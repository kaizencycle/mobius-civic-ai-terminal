'use client';

import { useEffect, useRef } from 'react';
import ConfidenceBadge from '@/components/terminal/journal/ConfidenceBadge';
import DerivedFromChain from '@/components/terminal/journal/DerivedFromChain';
import SeverityPill from '@/components/terminal/journal/SeverityPill';
import type { JournalDisplayEntry } from '@/lib/journal/types';

export type JournalEntryCardProps = {
  entry: JournalDisplayEntry;
  onRelatedClick?: (journalEntryId: string) => void;
  registerAnchor?: (id: string, el: HTMLElement | null) => void;
};

export default function JournalEntryCard({ entry, onRelatedClick, registerAnchor }: JournalEntryCardProps) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    registerAnchor?.(entry.id, rootRef.current);
    return () => {
      registerAnchor?.(entry.id, null);
    };
  }, [entry.id, registerAnchor]);

  const rec = (entry.recommendation ?? '').trim();
  const inf = (entry.inference ?? '').trim();
  const showRec = rec.length > 0 && rec !== inf;
  const statusLabel = (entry.status ?? 'committed').toUpperCase();
  const scope = (entry.scope ?? '').trim();
  const category = (entry.category ?? '').trim();

  return (
    <article
      ref={(n) => {
        rootRef.current = n;
      }}
      data-journal-entry-id={entry.id}
      className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 font-mono text-slate-300">
            <span className="font-semibold">{entry.agent}</span>
            <span className="text-slate-500">·</span>
            <span>{entry.cycle ?? 'C-—'}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{entry.timestamp ?? '—'}</span>
          </div>
          {scope ? <p className="text-[11px] italic leading-snug text-slate-500">{scope}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <SeverityPill severity={entry.severity} />
          <ConfidenceBadge confidence={entry.confidence} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">{statusLabel}</span>
        {category ? (
          <span className="rounded border border-slate-700/80 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-400">
            {category}
          </span>
        ) : null}
        <span className="text-[10px] text-slate-600">source {entry.source ?? 'journal'}</span>
        {entry.source_mode ? (
          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${entry.source_mode === 'substrate' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-violet-500/30 bg-violet-500/10 text-violet-200'}`}>
            {entry.source_mode === 'substrate' ? 'SUBSTRATE' : 'KV'}
          </span>
        ) : null}
      </div>

      <div className="mt-2 text-slate-200">
        <span className="font-medium text-slate-400">Observed: </span>
        {entry.observation ?? '—'}
      </div>
      <div className="mt-1.5 text-slate-300">
        <span className="font-medium text-slate-500">Inferred: </span>
        {entry.inference ?? '—'}
      </div>
      {showRec ? (
        <div className="mt-1.5 text-slate-300">
          <span className="font-medium text-slate-500">Recommends: </span>
          {entry.recommendation}
        </div>
      ) : null}


      {entry.canonical_path ? (
        <div className="mt-1 text-[10px] text-cyan-300/80">canon: {entry.canonical_path}</div>
      ) : null}

      <DerivedFromChain items={entry.derivedFrom} onJournalRefClick={onRelatedClick} />
    </article>
  );
}
