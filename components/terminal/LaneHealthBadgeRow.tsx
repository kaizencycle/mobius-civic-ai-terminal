'use client';

import { cn } from '@/lib/utils';
import type { SnapshotLaneSemanticState, SnapshotLaneState } from '@/lib/terminal/snapshotLanes';
import { laneStateAbbrev } from '@/lib/terminal/snapshotLanes';

function toneForState(state: SnapshotLaneSemanticState): string {
  switch (state) {
    case 'healthy':
      return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200';
    case 'degraded':
      return 'border-amber-500/35 bg-amber-500/10 text-amber-200';
    case 'stale':
      return 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200';
    case 'empty':
      return 'border-slate-600 bg-slate-800/60 text-slate-300';
    case 'offline':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
    default:
      return 'border-slate-600 bg-slate-800/50 text-slate-300';
  }
}

function formatLaneTitle(lane: SnapshotLaneState): string {
  const iso = lane.lastUpdated ?? '';
  return iso ? `${lane.message}\nLast update: ${iso}` : lane.message;
}

/** Compact operator-facing snapshot lane matrix (C-274). */
export default function LaneHealthBadgeRow({ lanes, className }: { lanes: SnapshotLaneState[]; className?: string }) {
  if (lanes.length === 0) return null;

  return (
    <div
      className={cn(
        'flex gap-1.5 overflow-x-auto pb-0.5',
        className,
      )}
      role="list"
      aria-label="Terminal snapshot lane health"
    >
      {lanes.map((lane) => (
        <span
          key={lane.key}
          role="listitem"
          title={formatLaneTitle(lane)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.08em]',
            toneForState(lane.state),
          )}
        >
          <span className="text-slate-400">{lane.key}</span>
          <span className="font-semibold">{laneStateAbbrev(lane.state)}</span>
        </span>
      ))}
    </div>
  );
}

/** One-line summary of unhealthy lanes for command surface / debugging. */
export function runtimeStateSummary(lanes: SnapshotLaneState[]): string {
  const bad = lanes.filter((l) => l.state !== 'healthy' && l.state !== 'empty');
  if (bad.length === 0) {
    const empty = lanes.filter((l) => l.state === 'empty');
    if (empty.length === 0) return 'All snapshot lanes healthy.';
    return `Snapshot ok · ${empty.map((l) => `${l.key} empty`).join('; ')}`;
  }
  return bad.map((l) => `${l.key} ${l.state}`).join(' · ');
}
