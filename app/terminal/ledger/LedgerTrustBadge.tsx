'use client';

import type { LedgerEntry } from '@/lib/terminal/types';
import { computeLedgerTrustProfile } from '@/lib/agents/trust-weight';

function trustTone(score: number): string {
  if (score >= 0.8) return 'border-emerald-600/50 bg-emerald-500/10 text-emerald-200';
  if (score >= 0.55) return 'border-cyan-600/50 bg-cyan-500/10 text-cyan-200';
  if (score > 0) return 'border-amber-600/50 bg-amber-500/10 text-amber-200';
  return 'border-rose-600/50 bg-rose-500/10 text-rose-200';
}

export default function LedgerTrustBadge({ row, compact = false }: { row: LedgerEntry; compact?: boolean }) {
  const trust = computeLedgerTrustProfile(row);

  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 font-mono ${compact ? 'text-[8px]' : 'text-[9px]'} ${trustTone(trust.trustScore)}`}
      title={trust.reasons.join(' · ')}
    >
      <span>{trust.trustBand}</span>
      <span>{trust.trustScore.toFixed(2)}</span>
    </span>
  );
}
