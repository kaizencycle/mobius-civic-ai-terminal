'use client';

import { cn } from '@/lib/utils';
import type { SnapshotLaneState } from '@/lib/terminal/snapshotLanes';
import { formatRelativeAge, isoHoverTitle } from '@/lib/terminal/freshnessDisplay';

type DeploymentInfo = { commit_sha: string | null; environment: string | null };

/** Compact debug block for operators — normalized lanes + deploy identity (C-274). */
export default function SnapshotDiagnostics({
  lanes,
  snapshotAt,
  deployment,
  className,
}: {
  lanes: SnapshotLaneState[];
  snapshotAt: string | null;
  deployment: DeploymentInfo | null;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md border border-slate-800 bg-slate-950/70 p-3 text-[11px]', className)}>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Runtime diagnostics</div>
      <div className="mb-3 space-y-1 font-mono text-slate-300">
        <div>
          <span className="text-slate-500">Snapshot</span>{' '}
          <time dateTime={snapshotAt ?? undefined} title={isoHoverTitle(snapshotAt ?? undefined)} className="text-sky-300">
            {snapshotAt ? formatRelativeAge(snapshotAt) : '—'}
          </time>
        </div>
        <div>
          <span className="text-slate-500">Deploy</span>{' '}
          <span className="text-slate-200">
            {deployment?.commit_sha ? `${deployment.commit_sha.slice(0, 7)}` : 'local / unknown'}
            {deployment?.environment ? ` · ${deployment.environment}` : ''}
          </span>
        </div>
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-[10px] text-slate-400">
        {lanes.map((lane) => (
          <li key={lane.key} className="flex flex-wrap gap-x-2 border-b border-slate-800/80 py-1 last:border-0">
            <span className="shrink-0 uppercase text-slate-500">{lane.key}</span>
            <span
              className={cn(
                lane.state === 'healthy' && 'text-emerald-300',
                lane.state === 'empty' && 'text-slate-400',
                lane.state === 'stale' && 'text-cyan-300',
                lane.state === 'degraded' && 'text-amber-300',
                lane.state === 'offline' && 'text-rose-300',
              )}
            >
              {lane.state}
            </span>
            <span className="min-w-0 flex-1 text-slate-500" title={lane.message}>
              {lane.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
