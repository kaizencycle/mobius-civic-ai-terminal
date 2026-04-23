'use client';

import { useState } from 'react';
import type { CycleIntegritySummary, IntegrityRating } from '@/lib/echo/integrity-engine';
import { cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

// ── Agent colors & icons ─────────────────────────────────────

const AGENT_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  ATLAS: { color: 'text-sky-300', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  ZEUS: { color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  JADE: { color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  EVE: { color: 'text-fuchsia-300', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30' },
};

const AGENT_ROLES: Record<string, string> = {
  ATLAS: 'Infrastructure Integrity',
  ZEUS: 'Source Verification',
  JADE: 'Pattern & Morale',
  EVE: 'Ethics & Bias',
};

const VERDICT_STYLE: Record<string, string> = {
  verified: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  flagged: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  contested: 'text-red-300 border-red-500/30 bg-red-500/10',
};

function scoreColor(score: number): string {
  if (score >= 0.90) return 'text-emerald-300';
  if (score >= 0.80) return 'text-sky-300';
  if (score >= 0.70) return 'text-amber-300';
  return 'text-red-300';
}

function barColor(score: number): string {
  if (score >= 0.90) return 'bg-emerald-500';
  if (score >= 0.80) return 'bg-sky-500';
  if (score >= 0.70) return 'bg-amber-500';
  return 'bg-red-500';
}

// ── Sub-components ───────────────────────────────────────────

function AgentScoreBar({ agent, score }: { agent: string; score: number }) {
  const style = AGENT_STYLE[agent] ?? AGENT_STYLE.ATLAS;
  const pct = Math.round(score * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-mono font-semibold', style.color)}>{agent}</span>
          <span className="text-[10px] font-sans text-slate-500">{AGENT_ROLES[agent]}</span>
        </div>
        <span className={cn('text-xs font-mono', scoreColor(score))}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800">
        <div
          className={cn('h-1.5 rounded-full transition-all duration-500', barColor(score))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RatingCard({
  rating,
  isExpanded,
  onToggle,
}: {
  rating: IntegrityRating;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition',
        isExpanded
          ? 'border-sky-500/40 bg-sky-500/10'
          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-slate-400">{rating.eventId}</span>
          <span
            className={cn(
              'rounded-md border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em]',
              VERDICT_STYLE[rating.verdict],
            )}
          >
            {rating.verdict}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={cn('text-sm font-mono font-semibold', scoreColor(rating.mii))}>
            {(rating.mii * 100).toFixed(1)}%
          </span>
          {rating.micMinted > 0 && (
            <span className="text-[10px] font-mono text-emerald-300">
              +{rating.micMinted.toFixed(4)} MIC
            </span>
          )}
          <span className="text-slate-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Agent scores */}
          <div className="space-y-2">
            {rating.ratings.map((ar) => (
              <div key={ar.agent}>
                <AgentScoreBar agent={ar.agent} score={ar.score} />
                <div className="mt-1 text-[10px] font-sans text-slate-500 pl-1">
                  {ar.rationale}
                </div>
              </div>
            ))}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
              Shard: {rating.shardType}
            </span>
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
              Weight: {rating.shardValue.toFixed(1)}
            </span>
            <span className={cn(
              'rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono',
              rating.integrityDelta >= 0 ? 'text-emerald-300' : 'text-red-300',
            )}>
              GI: {rating.integrityDelta >= 0 ? '+' : ''}{rating.integrityDelta.toFixed(4)}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

// ── Main panel ───────────────────────────────────────────────

export default function IntegrityRatingPanel({
  integrity,
}: {
  integrity: CycleIntegritySummary | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!integrity || integrity.eventCount === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <SectionLabel
          title="Integrity Ratings"
          subtitle="ATLAS x ZEUS x JADE x EVE — sentinel consensus"
        />
        <div className="mt-3 rounded-lg border border-dashed border-slate-800 bg-slate-950 p-4 text-center text-sm font-sans text-slate-500">
          Awaiting ECHO ingest data for integrity rating.
        </div>
      </section>
    );
  }

  const verifiedCount = integrity.ratings.filter((r) => r.verdict === 'verified').length;
  const flaggedCount = integrity.ratings.filter((r) => r.verdict === 'flagged').length;
  const contestedCount = integrity.ratings.filter((r) => r.verdict === 'contested').length;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Integrity Ratings"
        subtitle="ATLAS x ZEUS x JADE x EVE — sentinel consensus"
      />

      {/* Cycle summary bar */}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="text-center">
          <div className={cn('text-2xl font-mono font-semibold', scoreColor(integrity.avgMii))}>
            {(integrity.avgMii * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
            Avg MII
          </div>
        </div>
        <div className="text-center">
          <div className={cn(
            'text-2xl font-mono font-semibold',
            integrity.totalGiDelta >= 0 ? 'text-emerald-300' : 'text-red-300',
          )}>
            {integrity.totalGiDelta >= 0 ? '+' : ''}{integrity.totalGiDelta.toFixed(4)}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
            GI Delta
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-mono font-semibold text-sky-300">
            {(integrity.totalMicProvisional ?? integrity.totalMicMinted).toFixed(4)}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
            MIC provisional
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-mono font-semibold text-white">
            {integrity.eventCount}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
            Events
          </div>
        </div>
      </div>

      {/* Verdict breakdown */}
      <div className="mt-3 flex items-center gap-2">
        {verifiedCount > 0 && (
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
            {verifiedCount} verified
          </span>
        )}
        {flaggedCount > 0 && (
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono text-amber-300">
            {flaggedCount} flagged
          </span>
        )}
        {contestedCount > 0 && (
          <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-mono text-red-300">
            {contestedCount} contested
          </span>
        )}
      </div>

      {/* Agent average scores */}
      <div className="mt-4 space-y-2">
        {Object.entries(integrity.agentAverages).map(([agent, avg]) => (
          <AgentScoreBar key={agent} agent={agent} score={avg} />
        ))}
      </div>

      {/* Per-event ratings */}
      <div className="mt-4 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
          Per-Event Ratings
        </div>
        {integrity.ratings.map((rating) => (
          <RatingCard
            key={rating.eventId}
            rating={rating}
            isExpanded={expandedId === rating.eventId}
            onToggle={() =>
              setExpandedId((prev) => (prev === rating.eventId ? null : rating.eventId))
            }
          />
        ))}
      </div>
    </section>
  );
}
