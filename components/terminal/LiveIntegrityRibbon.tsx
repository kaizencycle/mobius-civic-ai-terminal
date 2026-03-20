'use client';

/**
 * LiveIntegrityRibbon — Collapsible integrity status bar.
 *
 * Defaults to a compact summary and expands on click to reveal the
 * full metric chip set, reducing first-paint chrome while preserving
 * access to the detailed health/freshness signals.
 */

import { useState } from 'react';
import { cn } from '@/lib/terminal/utils';

export type IntegrityTone = 'stable' | 'watch' | 'degraded';

export type LiveIntegrityRibbonProps = {
  gi: number;
  mii: number;
  micDelta: number;
  tripwireState: IntegrityTone;
  lastLedgerSyncLabel: string;
  lastIngestLabel: string;
  lastCycleAdvanceLabel: string;
  cycleId: string;
  streamLabel: string;
};

const TONE_DOT: Record<IntegrityTone, string> = {
  stable: 'bg-emerald-400',
  watch: 'bg-amber-400',
  degraded: 'bg-red-400',
};

const TONE_STYLES: Record<IntegrityTone, string> = {
  stable: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  watch: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  degraded: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
};

function MetricChip({ label, value, tone }: { label: string; value: string; tone?: IntegrityTone }) {
  return (
    <div
      className={cn(
        'shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-300 transition-colors duration-300',
        tone ? TONE_STYLES[tone] : 'border-slate-800 bg-slate-900/80',
      )}
    >
      <span className="text-slate-500">{label}</span>{' '}
      <span className="text-current">{value}</span>
    </div>
  );
}

function formatScore(value: number) {
  if (Number.isNaN(value)) return '--';
  return value.toFixed(2);
}

export default function LiveIntegrityRibbon({
  gi,
  mii,
  micDelta,
  tripwireState,
  lastLedgerSyncLabel,
  lastIngestLabel,
  lastCycleAdvanceLabel,
  cycleId,
  streamLabel,
}: LiveIntegrityRibbonProps) {
  const [expanded, setExpanded] = useState(false);
  const micLabel = `${micDelta >= 0 ? '+' : ''}${micDelta.toFixed(1)}`;
  const giTone: IntegrityTone = gi >= 0.9 ? 'stable' : gi >= 0.78 ? 'watch' : 'degraded';

  return (
    <button
      onClick={() => setExpanded((value) => !value)}
      className="w-full border-b border-sky-500/10 bg-slate-950/90 text-left backdrop-blur transition-all duration-300"
    >
      <div className="flex items-center gap-3 px-4 py-1.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', TONE_DOT[tripwireState])} />
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', TONE_DOT[tripwireState])} />
        </span>

        <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-sky-300">
          Integrity
        </span>

        <div className="flex min-w-0 items-center gap-2 overflow-hidden text-[10px] font-mono">
          <span className={cn(giTone === 'stable' ? 'text-emerald-300' : giTone === 'watch' ? 'text-amber-300' : 'text-red-300')}>
            GI {formatScore(gi)}
          </span>
          <span className="text-slate-600">·</span>
          <span className={cn(tripwireState === 'stable' ? 'text-emerald-300' : tripwireState === 'watch' ? 'text-amber-300' : 'text-red-300')}>
            {tripwireState.toUpperCase()}
          </span>
          <span className="text-slate-600">·</span>
          <span className="truncate text-slate-400">{cycleId}</span>
          <span className="text-slate-600">·</span>
          <span className={cn(streamLabel === 'LIVE' ? 'text-emerald-300' : streamLabel === 'OFFLINE' ? 'text-slate-500' : 'text-amber-300')}>
            {streamLabel}
          </span>
        </div>

        <span className={cn('ml-auto text-[10px] font-mono text-slate-600 transition-transform duration-300', expanded && 'rotate-180')}>
          ▾
        </span>
      </div>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          expanded ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
          <MetricChip label="cycle" value={cycleId} />
          <MetricChip label="gi" value={formatScore(gi)} tone={giTone} />
          <MetricChip label="mii" value={formatScore(mii)} tone={mii >= 0.9 ? 'stable' : mii >= 0.78 ? 'watch' : 'degraded'} />
          <MetricChip label="mic" value={micLabel} tone={micDelta >= 0 ? 'stable' : 'degraded'} />
          <MetricChip label="tripwire" value={tripwireState.toUpperCase()} tone={tripwireState} />
          <MetricChip label="ledger" value={lastLedgerSyncLabel} />
          <MetricChip label="ingest" value={lastIngestLabel} />
          <MetricChip label="cycle advance" value={lastCycleAdvanceLabel} />
          <MetricChip label="stream" value={streamLabel} />
        </div>
      </div>
    </button>
  );
}
