'use client';

import type { MicReadinessResponse } from '@/lib/mic/types';

export function FountainStatusCard({ fountain }: { fountain: MicReadinessResponse['fountain'] }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fountain</h3>
      <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
        <div>Lane: {fountain.lane}</div>
        <div>Locked: {String(fountain.locked)}</div>
        <div>Eligible: {String(fountain.eligible)}</div>
        <div>Unlocked: {String(fountain.unlocked)}</div>
      </div>
    </div>
  );
}
