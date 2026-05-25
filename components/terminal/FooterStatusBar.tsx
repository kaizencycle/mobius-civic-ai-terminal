'use client';

import { useShellSnapshot } from '@/components/terminal/ShellSnapshotProvider';

// C-305 OPT-07: age label with "ago" suffix + color-coded staleness thresholds
function ageLabelFromIso(timestamp: string | null | undefined): string {
  if (!timestamp) return '—';
  const ms = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function ageClass(timestamp: string | null | undefined, freshMs: number): string {
  if (!timestamp) return 'text-slate-500';
  const ms = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'text-slate-500';
  return ms <= freshMs ? 'text-emerald-400' : 'text-amber-400';
}

export default function FooterStatusBar() {
  const { shell, loading } = useShellSnapshot();

  const runtimeAge = loading && !shell ? '—' : ageLabelFromIso(shell?.heartbeat.runtime);
  const journalAge = loading && !shell ? '—' : ageLabelFromIso(shell?.heartbeat.journal);
  const runtimeLabel = loading && !shell ? '—' : shell?.degraded ? 'degraded' : 'nominal';
  const runtimeAgeClass = loading && !shell ? 'text-slate-500' : ageClass(shell?.heartbeat.runtime, 120_000);
  const journalAgeClass = loading && !shell ? 'text-slate-500' : ageClass(shell?.heartbeat.journal, 300_000);
  const tripwireCount = shell?.tripwire.count ?? 0;
  const tripwireElevated = shell?.tripwire.elevated ?? false;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-1 text-[10px] font-mono uppercase tracking-wide text-slate-400">
      Runtime {runtimeLabel} · Source {shell?.source ?? 'fallback'} · Runtime hb{' '}
      <span className={runtimeAgeClass}>{runtimeAge}</span> · Journal hb{' '}
      <span className={journalAgeClass}>{journalAge}</span> · tripwire{' '}
      {loading && !shell
        ? '—'
        : <span className={tripwireElevated ? 'text-red-400' : 'text-slate-500'}>
            {tripwireElevated ? `${tripwireCount} elevated` : `${tripwireCount} nominal`}
          </span>
      }
    </div>
  );
}
