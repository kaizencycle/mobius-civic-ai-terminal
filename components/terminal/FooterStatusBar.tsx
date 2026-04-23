'use client';

import { useShellSnapshot } from '@/hooks/useShellSnapshot';

function ageLabelFromIso(timestamp: string | null | undefined): string {
  if (!timestamp) return '—';
  const ms = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

export default function FooterStatusBar() {
  const { shell, loading } = useShellSnapshot();

  const runtimeAge = loading && !shell ? '—' : ageLabelFromIso(shell?.heartbeat.runtime);
  const journalAge = loading && !shell ? '—' : ageLabelFromIso(shell?.heartbeat.journal);
  const runtimeLabel = loading && !shell ? '—' : shell?.degraded ? 'degraded' : 'nominal';
  const tripwireLabel = loading && !shell
    ? 'tripwire —'
    : shell?.tripwire.elevated
      ? `tripwire ${shell.tripwire.count} elevated`
      : `tripwire ${shell?.tripwire.count ?? 0} nominal`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-1 text-[10px] font-mono uppercase tracking-wide text-slate-400">
      Runtime {runtimeLabel} · Source {shell?.source ?? 'fallback'} · Runtime hb {runtimeAge} · Journal hb {journalAge} · {tripwireLabel}
    </div>
  );
}
