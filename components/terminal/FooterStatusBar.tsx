'use client';

import { useEffect, useMemo, useState } from 'react';

type HealthResponse = {
  status?: 'operational' | 'degraded';
  pulse?: { timestamp?: string | null; age_seconds?: number | null; cycle?: string | null };
  heartbeat?: {
    runtime?: string | null;
    runtime_age_seconds?: number | null;
    journal?: string | null;
    journal_age_seconds?: number | null;
  };
  tripwire?: {
    elevated?: boolean;
    tripwire_count?: number;
  } | null;
  kv?: { available?: boolean } | null;
};

function ageLabel(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function FooterStatusBar() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const data = await fetch('/api/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })
        .then((r) => r.json() as Promise<HealthResponse>)
        .catch(() => null);
      if (!mounted) return;
      setHealth(data);
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const kv = health?.kv?.available ? 'healthy' : 'degraded';
  const runtimeLabel = useMemo(() => (health?.status === 'degraded' ? 'degraded' : 'nominal'), [health?.status]);
  const pulseAge = ageLabel(health?.pulse?.age_seconds);
  const runtimeAge = ageLabel(health?.heartbeat?.runtime_age_seconds);
  const journalAge = ageLabel(health?.heartbeat?.journal_age_seconds);
  const tripwireLabel = health?.tripwire?.elevated
    ? `tripwire ${health.tripwire.tripwire_count ?? 0} elevated`
    : `tripwire ${health?.tripwire?.tripwire_count ?? 0} nominal`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-1 text-[10px] font-mono uppercase tracking-wide text-slate-400">
      Runtime {runtimeLabel} · KV {kv} · Pulse {pulseAge} · Runtime hb {runtimeAge} · Journal hb {journalAge} · {tripwireLabel}
    </div>
  );
}
