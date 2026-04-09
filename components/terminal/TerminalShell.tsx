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
    };

    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const gi = Number(integrity?.global_integrity ?? 0);
  const giTone = useMemo(
    () => (gi >= 0.85 ? 'text-emerald-300 border-emerald-500/40' : gi >= 0.7 ? 'text-amber-300 border-amber-500/40' : 'text-rose-300 border-rose-500/40'),
    [gi],
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#020617] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded border border-cyan-400/60 bg-cyan-400/10 px-2 py-0.5 font-mono text-xs">⌘</div>
            <div className="text-sm font-semibold tracking-wide">MOBIUS CIVIC TERMINAL</div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className={cn('rounded border px-2 py-1', giTone)}>GI {gi.toFixed(2)}</span>
            <span className={cn('rounded border px-2 py-1 uppercase', runtimeBadgeClass(runtime))}>{runtime}</span>
            <span className="hidden rounded border border-slate-700 px-2 py-1 md:inline">{clock}</span>
            <span className="rounded border border-slate-700 px-2 py-1">{integrity?.cycle ?? 'C-—'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <ChamberSwitcher />
          <button
            type="button"
            onClick={() => setShowLaneDiagnostics((current) => !current)}
            className={cn(
              'shrink-0 rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-wide',
              showLaneDiagnostics ? 'border-cyan-500/60 text-cyan-200' : 'border-slate-700 text-slate-400',
            )}
          >
            Lane diag
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden pb-28">{children}</main>
    </div>
  );
}
