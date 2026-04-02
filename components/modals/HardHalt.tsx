'use client';

import { C261_COVENANT } from '@/lib/constants/covenants';
import type { BreakerStage, CircuitBreakerDecision } from '@/lib/integrity-check';
import { cn } from '@/lib/terminal/utils';

type HardHaltProps = {
  stage?: BreakerStage;
  isOpen?: boolean;
  giScore: number;
  reason: string;
  triggeredBy?: CircuitBreakerDecision['triggeredBy'];
};

const STAGE_TONE: Record<BreakerStage, string> = {
  nominal: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  guarded: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  containment: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  halt: 'border-red-500/50 bg-black/90 text-red-300',
};

export default function HardHalt({
  stage,
  isOpen,
  giScore,
  reason,
  triggeredBy = [],
}: HardHaltProps) {
  const resolvedStage: BreakerStage = stage ?? (isOpen ? 'halt' : 'nominal');
  if (resolvedStage === 'nominal') return null;

  if (resolvedStage === 'guarded' || resolvedStage === 'containment') {
    return (
      <div className="border-b border-slate-800 px-4 py-3">
        <div className={cn('mx-auto flex max-w-7xl items-start justify-between gap-4 rounded-lg border px-4 py-3 font-mono', STAGE_TONE[resolvedStage])}>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.16em]">
              {resolvedStage === 'guarded' ? 'Guarded Mode · C-261 Circuit Breaker' : 'Containment Mode · C-261 Circuit Breaker'}
            </div>
            <div className="text-sm text-slate-100">{reason}</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
              GI {giScore.toFixed(3)} · Triggered by {triggeredBy.length ? triggeredBy.join(', ') : 'integrity pressure'}
            </div>
          </div>
          <div className="shrink-0 text-right text-[11px] uppercase tracking-[0.12em] text-slate-300">
            <div>Guarded ≥ {C261_COVENANT.BREAKER.GUARDED_GI}</div>
            <div>Containment ≥ {C261_COVENANT.BREAKER.CONTAINMENT_GI}</div>
            <div>{resolvedStage === 'containment' ? 'Write lanes paused' : 'Write lanes under review'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm">
      <div className={cn('w-full max-w-2xl border-2 p-8 font-mono shadow-[0_0_50px_rgba(239,68,68,0.22)]', STAGE_TONE.halt)}>
        <div className="mb-6 flex items-center gap-4 border-b border-red-500/30 pb-4 text-red-400">
          <span className="text-3xl">⚠️</span>
          <h1 className="text-xl font-bold uppercase tracking-[0.08em]">Hard Halt: C-261 Circuit Breaker</h1>
        </div>

        <div className="space-y-5 text-slate-200">
          <p className="text-lg">System integrity breach detected.</p>

          <div className="rounded border border-red-500/50 bg-red-500/10 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="uppercase tracking-[0.08em]">Current GI Score</span>
              <span className="font-bold text-red-400">{giScore.toFixed(3)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Halt Threshold</span>
              <span>{C261_COVENANT.BREAKER.HALT_GI} (C-261)</span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p><span className="text-slate-400">Issue:</span> {reason}</p>
            <p><span className="text-slate-400">Triggered by:</span> {triggeredBy.length ? triggeredBy.join(', ') : 'integrity breach'}</p>
            <p><span className="text-slate-400">Status:</span> Write lanes and automation should remain closed until recovery.</p>
            <p><span className="text-slate-400">Operator path:</span> Navigation and diagnostics remain available for recovery review.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
