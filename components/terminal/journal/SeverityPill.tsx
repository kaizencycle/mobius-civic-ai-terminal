'use client';

import type { JournalDisplaySeverity } from '@/lib/journal/types';

type Props = {
  severity: JournalDisplaySeverity | undefined;
};

export default function SeverityPill({ severity }: Props) {
  const s = (severity ?? 'nominal').toLowerCase() as JournalDisplaySeverity;
  const label = s.toUpperCase();

  if (s === 'critical') {
    return (
      <span className="motion-safe:animate-pulse rounded-full border border-rose-500/55 bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-100 motion-reduce:animate-none">
        {label}
      </span>
    );
  }
  if (s === 'elevated') {
    return (
      <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-100">
        {label}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {label}
    </span>
  );
}
