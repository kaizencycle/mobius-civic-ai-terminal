'use client';

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

function formatScore(value: number) {
  if (Number.isNaN(value)) return '--';
  return value.toFixed(2);
}

const TONE_STYLES: Record<IntegrityTone, string> = {
  stable: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  watch: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  degraded: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
};

function MetricChip({ label, value, tone }: { label: string; value: string; tone?: IntegrityTone }) {
  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-300',
        tone ? TONE_STYLES[tone] : 'border-slate-800 bg-slate-900/80',
      )}
    >
      <span className="text-slate-500">{label}</span>{' '}
      <span className="text-current">{value}</span>
    </div>
  );
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
  const micLabel = `${micDelta >= 0 ? '+' : ''}${micDelta.toFixed(1)}`;

  return (
    <section className="border-b border-slate-800 bg-slate-950/90 px-4 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 text-[11px] font-mono font-semibold uppercase tracking-[0.22em] text-sky-300">
          Live Integrity Ribbon
        </div>
        <MetricChip label="cycle" value={cycleId} />
        <MetricChip label="gi" value={formatScore(gi)} tone={gi >= 0.9 ? 'stable' : gi >= 0.78 ? 'watch' : 'degraded'} />
        <MetricChip label="mii" value={formatScore(mii)} tone={mii >= 0.9 ? 'stable' : mii >= 0.78 ? 'watch' : 'degraded'} />
        <MetricChip label="mic" value={micLabel} tone={micDelta >= 0 ? 'stable' : 'degraded'} />
        <MetricChip label="tripwire" value={tripwireState.toUpperCase()} tone={tripwireState} />
        <MetricChip label="ledger" value={lastLedgerSyncLabel} />
        <MetricChip label="ingest" value={lastIngestLabel} />
        <MetricChip label="cycle advance" value={lastCycleAdvanceLabel} />
        <MetricChip label="stream" value={streamLabel} />
      </div>
    </section>
  );
}
