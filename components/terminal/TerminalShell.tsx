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
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 uppercase md:px-2 md:py-1',
                loading ? 'border-slate-700 bg-slate-800/40 text-slate-500' : runtimeBadgeClass(runtime),
              )}
            >
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
