'use client';

import type { JournalDisplayEntry } from '@/lib/journal/types';

type Props = {
  confidence: JournalDisplayEntry['confidence'];
};

export default function ConfidenceBadge({ confidence }: Props) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;

  const c = Math.max(0, Math.min(1, confidence));
  let cls =
    'rounded-full border px-2 py-0.5 font-mono text-[10px] tabular-nums border-slate-600 bg-slate-800/80 text-slate-300';
  if (c >= 0.85) {
    cls =
      'rounded-full border px-2 py-0.5 font-mono text-[10px] tabular-nums border-emerald-500/45 bg-emerald-500/10 text-emerald-100';
  } else if (c >= 0.7) {
    cls =
      'rounded-full border px-2 py-0.5 font-mono text-[10px] tabular-nums border-amber-500/45 bg-amber-500/10 text-amber-100';
  }

  return <span className={cls}>{c.toFixed(2)}</span>;
}
