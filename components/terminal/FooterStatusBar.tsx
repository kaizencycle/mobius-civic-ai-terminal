'use client';

import { useMemo } from 'react';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

function ageLabel(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function FooterStatusBar() {
  const { snapshot, loading } = useTerminalSnapshot();

  const kvLane = (snapshot?.kvHealth?.data ?? null) as Record<string, unknown> | null;
  const runtimeLane = (snapshot?.runtime?.data ?? null) as Record<string, unknown> | null;
  const tripwireLane = (snapshot?.tripwire?.data ?? null) as Record<string, unknown> | null;
  const pulse = runtimeLane?.pulse && typeof runtimeLane.pulse === 'object' ? (runtimeLane.pulse as Record<string, unknown>) : null;
  const heartbeat = runtimeLane?.heartbeat && typeof runtimeLane.heartbeat === 'object' ? (runtimeLane.heartbeat as Record<string, unknown>) : null;

  const kvAvailable = kvLane?.available === true;
  const kvLatency = typeof kvLane?.latencyMs === 'number' ? kvLane.latencyMs : null;
  const kv = loading && !snapshot ? '—' : kvAvailable ? `ok · ${kvLatency ?? '?'}ms` : 'degraded';
  const runtimeLabel = useMemo(() => {
    if (loading && !snapshot) return '—';
    if (snapshot?.degraded) return 'degraded';
    return 'nominal';
  }, [loading, snapshot]);
  const pulseAge = loading && !snapshot ? '—' : ageLabel(typeof pulse?.age_seconds === 'number' ? pulse.age_seconds : null);
  const runtimeAge = loading && !snapshot ? '—' : ageLabel(typeof heartbeat?.runtime_age_seconds === 'number' ? heartbeat.runtime_age_seconds : null);
  const journalAge = loading && !snapshot ? '—' : ageLabel(typeof heartbeat?.journal_age_seconds === 'number' ? heartbeat.journal_age_seconds : null);
  const tripwireCount = typeof tripwireLane?.tripwire_count === 'number'
    ? tripwireLane.tripwire_count
    : typeof tripwireLane?.tripwireCount === 'number'
      ? tripwireLane.tripwireCount
      : 0;
  const tripwireLabel = loading && !snapshot
    ? 'tripwire —'
    : tripwireLane?.elevated
      ? `tripwire ${tripwireCount} elevated`
      : `tripwire ${tripwireCount} nominal`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-1 text-[10px] font-mono uppercase tracking-wide text-slate-400">
      Runtime {runtimeLabel} · KV {kv} · Pulse {pulseAge} · Runtime hb {runtimeAge} · Journal hb {journalAge} · {tripwireLabel}
    </div>
  );
}
