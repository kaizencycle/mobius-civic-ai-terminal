'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ChamberSwitcher from '@/components/terminal/ChamberSwitcher';
import { cn } from '@/lib/utils';

type IntegrityStatus = {
  cycle?: string;
  global_integrity?: number;
};

type RuntimeStatus = {
  degraded?: boolean;
  freshness?: { status?: string };
};

function runtimeBadgeClass(runtime: 'online' | 'degraded' | 'offline') {
  if (runtime === 'online') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (runtime === 'degraded') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
}

export default function TerminalShell({ children }: { children: ReactNode }) {
  const [integrity, setIntegrity] = useState<IntegrityStatus | null>(null);
  const [runtime, setRuntime] = useState<'online' | 'degraded' | 'offline'>('offline');
  const [clock, setClock] = useState('—');
  const [showLaneDiagnostics, setShowLaneDiagnostics] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [integrityRes, runtimeRes] = await Promise.allSettled([
        fetch('/api/integrity-status', { cache: 'no-store' }).then((r) => r.json() as Promise<IntegrityStatus>),
        fetch('/api/runtime/status', { cache: 'no-store' }).then((r) => r.json() as Promise<RuntimeStatus>),
      ]);

      if (!mounted) return;

      if (integrityRes.status === 'fulfilled') {
        setIntegrity(integrityRes.value);
      }

      if (runtimeRes.status === 'fulfilled') {
        const freshness = runtimeRes.value.freshness?.status;
        if (runtimeRes.value.degraded || freshness === 'stale') {
          setRuntime('degraded');
        } else {
          setRuntime('online');
        }
      } else {
        setRuntime('offline');
      }

      setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
      setIsLoading(false);
    };

    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  // Read persisted console collapse state on mount
  useEffect(() => {
    const stored = localStorage.getItem('mobius_console_collapsed');
    if (stored === 'true') setConsoleCollapsed(true);
  }, []);

  // Sync console collapse state when CommandSurface toggles
  useEffect(() => {
    const handler = (e: Event) => {
      setConsoleCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };
    window.addEventListener('mobius:console-toggle', handler as EventListener);
    return () => window.removeEventListener('mobius:console-toggle', handler as EventListener);
  }, []);

  const gi = Number(integrity?.global_integrity ?? 0);
  const giTone = useMemo(
    () => (gi >= 0.85 ? 'text-emerald-300 border-emerald-500/40' : gi >= 0.7 ? 'text-amber-300 border-amber-500/40' : 'text-rose-300 border-rose-500/40'),
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
            <span className={cn('rounded border px-1.5 py-0.5 md:px-2 md:py-1', isLoading ? 'border-slate-700 text-slate-500' : giTone)}>
              GI {isLoading ? '—' : gi.toFixed(2)}
            </span>
            <span className={cn('rounded border px-1.5 py-0.5 uppercase md:px-2 md:py-1', isLoading ? 'border-slate-700 bg-slate-800/40 text-slate-500' : runtimeBadgeClass(runtime))}>
              {isLoading ? 'loading' : runtime}
            </span>
            <span className="hidden rounded border border-slate-700 px-2 py-1 md:inline">{clock}</span>
            <span className="rounded border border-slate-700 px-1.5 py-0.5 md:px-2 md:py-1">{integrity?.cycle ?? 'C-—'}</span>
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
