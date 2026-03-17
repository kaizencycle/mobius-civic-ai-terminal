'use client';

import type { SignalScore } from '@/lib/echo/signal-engine';
import { cycleSignalHealth } from '@/lib/echo/signal-engine';
import SectionLabel from './SectionLabel';

// ── Classification badge ─────────────────────────────────────

const CLASSIFICATION_STYLES: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  SIGNAL: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    glow: 'shadow-[0_0_8px_rgba(16,185,129,0.15)]',
  },
  EMERGING: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    glow: 'shadow-[0_0_8px_rgba(245,158,11,0.15)]',
  },
  DISTORTION: {
    bg: 'bg-red-500/10',
    text: 'text-red-300',
    border: 'border-red-500/30',
    glow: 'shadow-[0_0_8px_rgba(239,68,68,0.15)]',
  },
};

// ── Score bar ────────────────────────────────────────────────

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-[36px] shrink-0 text-right text-[11px] font-mono text-slate-400">
        {pct}%
      </span>
    </div>
  );
}

// ── Event card ───────────────────────────────────────────────

function SignalEventCard({
  score,
  selected,
  onClick,
}: {
  score: SignalScore;
  selected: boolean;
  onClick: () => void;
}) {
  const style = CLASSIFICATION_STYLES[score.classification] ?? CLASSIFICATION_STYLES.EMERGING;

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-all duration-150 ${
        selected
          ? `border-sky-500/40 bg-sky-500/8 ${style.glow}`
          : `border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900`
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
            {score.eventId}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-200 truncate">
            {score.title}
          </div>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-[0.12em] ${style.bg} ${style.text} ${style.border}`}>
          {score.classification}
        </span>
      </div>

      {/* Score bars */}
      <div className="mt-3 space-y-1.5">
        <ScoreBar label="Signal" value={score.signal} color="bg-emerald-500" />
        <ScoreBar label="Narrative" value={score.narrative} color="bg-amber-500" />
        <ScoreBar label="Volatility" value={score.volatility} color="bg-rose-500" />
      </div>

      {/* Divergence indicator */}
      {score.divergence > 0.1 && (
        <div className="mt-2 text-[10px] font-mono text-amber-400/80">
          Narrative ahead of signal by {(score.divergence * 100).toFixed(0)}%
        </div>
      )}

      {/* Summary */}
      <div className="mt-2 text-xs text-slate-400 leading-relaxed">
        {score.summary}
      </div>
    </button>
  );
}

// ── Cycle health summary ─────────────────────────────────────

function CycleHealthBar({ scores }: { scores: SignalScore[] }) {
  const health = cycleSignalHealth(scores);

  const healthColor =
    health.healthLabel === 'High clarity' ? 'text-emerald-300' :
    health.healthLabel === 'Moderate clarity' ? 'text-sky-300' :
    health.healthLabel === 'Narrative-heavy' ? 'text-amber-300' :
    'text-red-300';

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
          Cycle Signal Health
        </span>
        <span className={`text-xs font-mono font-medium ${healthColor}`}>
          {health.healthLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-lg font-mono font-semibold text-emerald-300">
            {health.signalCount}
          </div>
          <div className="text-[9px] font-mono uppercase tracking-[0.1em] text-slate-500">
            Signal
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-mono font-semibold text-amber-300">
            {health.emergingCount}
          </div>
          <div className="text-[9px] font-mono uppercase tracking-[0.1em] text-slate-500">
            Emerging
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-mono font-semibold text-red-300">
            {health.distortionCount}
          </div>
          <div className="text-[9px] font-mono uppercase tracking-[0.1em] text-slate-500">
            Distortion
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <ScoreBar label="Avg Sig" value={health.avgSignal} color="bg-emerald-500" />
        <ScoreBar label="Avg Nar" value={health.avgNarrative} color="bg-amber-500" />
        <ScoreBar label="Avg Vol" value={health.avgVolatility} color="bg-rose-500" />
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────

export default function SignalEnginePanel({
  scores,
  selectedId,
  onSelect,
}: {
  scores: SignalScore[];
  selectedId?: string;
  onSelect?: (score: SignalScore) => void;
}) {
  if (scores.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Signal Engine"
        subtitle="Signal vs narrative vs volatility — real-time divergence tracking"
      />

      <div className="mt-3">
        <CycleHealthBar scores={scores} />
      </div>

      <div className="mt-3 space-y-2">
        {scores.map((score) => (
          <SignalEventCard
            key={score.eventId}
            score={score}
            selected={score.eventId === selectedId}
            onClick={() => onSelect?.(score)}
          />
        ))}
      </div>
    </section>
  );
}
