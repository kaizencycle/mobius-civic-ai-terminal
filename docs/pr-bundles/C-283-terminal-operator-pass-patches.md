# C-283 Operator Pass — Code-Ready Patch Set

This file captures the code-ready replacements for the four implementation files in the operator pass bundle.

## 1) `components/terminal/TerminalShell.tsx`

```tsx
'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ChamberSwitcher from '@/components/terminal/ChamberSwitcher';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import { cn } from '@/lib/utils';

function runtimeBadgeClass(runtime: 'online' | 'degraded' | 'offline') {
  if (runtime === 'online') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (runtime === 'degraded') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
}

type SnapshotIntegrityData = {
  cycle?: string;
  global_integrity?: number;
  mode?: string;
  terminal_status?: string;
};

function asIntegrityData(input: unknown): SnapshotIntegrityData | null {
  if (!input || typeof input !== 'object') return null;
  return input as SnapshotIntegrityData;
}

export default function TerminalShell({ children }: { children: ReactNode }) {
  const { snapshot, loading } = useTerminalSnapshot();
  const [clock, setClock] = useState('—');
  const [showLaneDiagnostics, setShowLaneDiagnostics] = useState(false);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('mobius_console_collapsed');
    if (stored === 'true') setConsoleCollapsed(true);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setConsoleCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };
    window.addEventListener('mobius:console-toggle', handler as EventListener);
    return () => window.removeEventListener('mobius:console-toggle', handler as EventListener);
  }, []);

  const integrityData = useMemo(
    () => asIntegrityData(snapshot?.integrity?.data) ?? null,
    [snapshot],
  );

  const gi = useMemo(() => {
    if (typeof snapshot?.gi === 'number') return snapshot.gi;
    if (typeof integrityData?.global_integrity === 'number') return integrityData.global_integrity;
    return 0;
  }, [snapshot, integrityData]);

  const cycle = snapshot?.cycle ?? integrityData?.cycle ?? 'C-—';
  const mode = (snapshot?.mode ?? integrityData?.mode ?? null)?.toString().toLowerCase() ?? null;

  const runtime = useMemo<'online' | 'degraded' | 'offline'>(() => {
    if (!snapshot && loading) return 'offline';
    if (!snapshot) return 'offline';
    if (snapshot.degraded || mode === 'yellow' || mode === 'red') return 'degraded';
    return 'online';
  }, [snapshot, loading, mode]);

  const giTone = useMemo(
    () =>
      gi >= 0.85
        ? 'text-emerald-300 border-emerald-500/40'
        : gi >= 0.7
          ? 'text-amber-300 border-amber-500/40'
          : 'text-rose-300 border-rose-500/40',
    [gi],
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#020617] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur md:px-4 md:py-3">
        <div className="mb-1.5 flex items-center justify-between gap-2 md:mb-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="rounded border border-cyan-400/60 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] md:px-2 md:text-xs">⌘</div>
            <div className="text-[13px] font-semibold tracking-[0.04em] md:text-sm md:tracking-wide">MOBIUS CIVIC TERMINAL</div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono md:gap-2 md:text-[11px]">
            <span className={cn('rounded border px-1.5 py-0.5 md:px-2 md:py-1', loading ? 'border-slate-700 text-slate-500' : giTone)}>
              GI {loading ? '—' : gi.toFixed(2)}
            </span>
            <span className={cn('rounded border px-1.5 py-0.5 uppercase md:px-2 md:py-1', loading ? 'border-slate-700 bg-slate-800/40 text-slate-500' : runtimeBadgeClass(runtime))}>
              {loading ? 'boot' : runtime}
            </span>
            <span className="hidden rounded border border-slate-700 px-2 py-1 md:inline">{clock}</span>
            <span className="rounded border border-slate-700 px-1.5 py-0.5 md:px-2 md:py-1">{cycle}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 md:gap-2">
          <ChamberSwitcher />
          <button
            type="button"
            onClick={() => setShowLaneDiagnostics((current) => !current)}
            className={cn(
              'shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] md:px-2 md:py-1 md:text-[10px] md:tracking-wide',
              showLaneDiagnostics ? 'border-cyan-500/60 text-cyan-200' : 'border-slate-700 text-slate-400',
            )}
          >
            Lane diag
          </button>
        </div>
      </header>

      <main className={cn('min-h-0 flex-1 overflow-hidden', consoleCollapsed ? 'pb-7' : 'pb-16 md:pb-28')}>{children}</main>
    </div>
  );
}
```

## 2) `components/terminal/FooterStatusBar.tsx`

```tsx
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
```

## 3) `app/terminal/journal/JournalPageClient.tsx`

See bundle source patch draft used for this PR pass. Core changes:
- operator-first sort by cycle/status/severity/confidence/time
- remove stale `C-274` fallback strings
- hide duplicate recommendation text
- badge status + severity in card header

## 4) `app/api/echo/feed/route.ts`

Core changes:
- add `NextRequest`
- operator-first ledger sorting
- allow `?sort=time` override
- include `meta.ledger_sort`
