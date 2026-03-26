'use client';

import { C261_COVENANT } from '@/lib/constants/covenants';

export default function HardHalt({
  isOpen,
  giScore,
  reason,
}: {
  isOpen: boolean;
  giScore: number;
  reason: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl border-2 border-orange-500 bg-slate-950 p-8 font-mono shadow-[0_0_50px_rgba(249,115,22,0.28)]">
        <div className="mb-6 flex items-center gap-4 border-b border-orange-500/30 pb-4 text-orange-400">
          <span className="text-3xl">⚠️</span>
          <h1 className="text-xl font-bold uppercase tracking-[0.08em]">Hard Halt: C-261 Circuit Breaker</h1>
        </div>

        <div className="space-y-5 text-slate-200">
          <p className="text-lg">System integrity breach detected.</p>

          <div className="rounded border border-orange-500/50 bg-orange-500/10 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="uppercase tracking-[0.08em]">Current GI Score</span>
              <span className="font-bold text-red-400">{giScore.toFixed(3)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Minimum Threshold</span>
              <span>{C261_COVENANT.GI_THRESHOLD} (C-261)</span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p><span className="text-slate-400">Issue:</span> {reason}</p>
            <p><span className="text-slate-400">Status:</span> Read-only mode recommended until recovery.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
