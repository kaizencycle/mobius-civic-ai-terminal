'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import ChamberSwitcher from '@/components/terminal/ChamberSwitcher';
import OnboardingOverlay from '@/components/terminal/OnboardingOverlay';
import ShellBridgeBanner from '@/components/terminal/ShellBridgeBanner';
import { DegradedBanner } from '@/components/terminal/DegradedBanner';
import SnapshotDiagnostics from '@/components/terminal/SnapshotDiagnostics';
import DataflowCommandSpine from '@/components/terminal/DataflowCommandSpine';
import { useShellSnapshot } from '@/hooks/useShellSnapshot';
import { useLaneDiagnosticsChamber } from '@/hooks/useLaneDiagnosticsChamber';
import { cn } from '@/lib/utils';
import type { SnapshotLaneState } from '@/lib/terminal/snapshotLanes';
import { usePathname } from 'next/navigation';

const SHELL_URL = 'https://mobius-browser-shell.vercel.app';

function pathnameToLabel(pathname: string): string | null {
  if (pathname.startsWith('/terminal/globe')) return 'Globe';
  if (pathname.startsWith('/terminal/pulse')) return 'Pulse';
  if (pathname.startsWith('/terminal/signals')) return 'Signals';
  if (pathname.startsWith('/terminal/sentinel')) return 'Sentinel';
  if (pathname.startsWith('/terminal/ledger')) return 'Ledger';
  if (pathname.startsWith('/terminal/journal')) return 'Journal';
  if (pathname.startsWith('/terminal/vault')) return 'Vault';
  if (pathname.startsWith('/terminal/canon')) return 'Vault Canon';
  if (pathname.startsWith('/terminal/replay')) return 'Vault Replay';
  return null;
}

function runtimeBadgeClass(runtime: 'online' | 'degraded' | 'offline') {
  if (runtime === 'online') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (runtime === 'degraded') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
}

export default function TerminalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [clock, setClock] = useState('—');
  const [showLaneDiagnostics, setShowLaneDiagnostics] = useState(false);
  const [showDataflowCommand, setShowDataflowCommand] = useState(true);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const { shell, loading } = useShellSnapshot();
  const flowTelemetryEnabled = showDataflowCommand || showLaneDiagnostics;
  const laneDiagnostics = useLaneDiagnosticsChamber(flowTelemetryEnabled);

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const seededGi = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const seed = (window as Window & { __MOBIUS_SHELL_SEED__?: { gi?: number | null } }).__MOBIUS_SHELL_SEED__;
    return typeof seed?.gi === 'number' && Number.isFinite(seed.gi) ? seed.gi : null;
  }, []);

  const gi = shell?.gi ?? seededGi;
  const cycle = shell?.cycle ?? 'C-—';
  const mode = shell?.mode?.toLowerCase() ?? null;

  const runtime = useMemo<'online' | 'degraded' | 'offline'>(() => {
    if (!shell && loading) return 'offline';
    if (!shell) return 'offline';
    if (shell.degraded || mode === 'yellow' || mode === 'red') return 'degraded';
    return 'online';
  }, [shell, loading, mode]);

  const giTone = useMemo(() => {
    if (gi === null) return 'text-slate-400 border-slate-600';
    if (gi >= 0.85) return 'text-emerald-300 border-emerald-500/40';
    if (gi >= 0.7) return 'text-amber-300 border-amber-500/40';
    return 'text-rose-300 border-rose-500/40';
  }, [gi]);

  const lanes = useMemo<SnapshotLaneState[]>(() => {
    const raw = laneDiagnostics.data?.lanes;
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw).map(([key, value]) => {
      const row = value as Record<string, unknown>;
      return {
        key,
        ok: row.ok !== false,
        state: typeof row.freshness === 'string' ? row.freshness : (row.state as string | undefined) ?? 'unknown',
        statusCode: 200,
        message: typeof row.message === 'string' ? row.message : `${key} lane`,
        lastUpdated: null,
        fallbackMode: null,
      } as unknown as SnapshotLaneState;
    });
  }, [laneDiagnostics.data]);


  useEffect(() => {
    if (typeof document === 'undefined') return;
    const active = pathnameToLabel(pathname);
    document.title = active ? `Mobius Terminal · ${active}` : 'Mobius Terminal';
  }, [pathname]);

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

  useEffect(() => {
    const section = pathname.split('/').filter(Boolean).at(-1) ?? 'terminal';
    const chamberName = section.charAt(0).toUpperCase() + section.slice(1);
    document.title = `Mobius Terminal · ${chamberName}`;
  }, [pathname]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#020617] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur md:px-4 md:py-3">
        <div className="mb-1.5 flex items-center justify-between gap-2 md:mb-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="rounded border border-cyan-400/60 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] md:px-2 md:text-xs">⌘</div>
            <div className="text-[13px] font-semibold tracking-[0.04em] md:text-sm md:tracking-wide">MOBIUS CIVIC TERMINAL</div>
            <a href={SHELL_URL} target="_blank" rel="noopener noreferrer" className="hidden rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-violet-300 md:inline-block">Shell</a>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono md:gap-2 md:text-[11px]">
            <span className={cn('flex items-center gap-1 rounded border px-1.5 py-0.5 md:px-2 md:py-1', loading ? 'border-slate-700 text-slate-500' : giTone)}>
              GI {gi === null ? '—' : gi.toFixed(2)}
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
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => setShowDataflowCommand((current) => !current)} className={cn('rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] md:px-2 md:py-1 md:text-[10px]', showDataflowCommand ? 'border-violet-500/60 text-violet-200' : 'border-slate-700 text-slate-400')}>
              Flow
            </button>
            <button type="button" onClick={() => setShowLaneDiagnostics((current) => !current)} className={cn('rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] md:px-2 md:py-1 md:text-[10px]', showLaneDiagnostics ? 'border-cyan-500/60 text-cyan-200' : 'border-slate-700 text-slate-400')}>
              Lane diag
            </button>
          </div>
        </div>
      </header>

      <DegradedBanner memoryMode={null} />

      <DataflowCommandSpine shell={shell} diagnostics={laneDiagnostics.data} visible={showDataflowCommand} />

      {showLaneDiagnostics ? (
        <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2 md:px-4">
          <SnapshotDiagnostics lanes={lanes} snapshotAt={shell?.timestamp ?? null} deployment={null} />
        </div>
      ) : null}

      <Suspense fallback={null}>
        <ShellBridgeBanner />
      </Suspense>

      <main className={cn('min-h-0 flex-1 overflow-y-auto', consoleCollapsed ? 'pb-7' : 'pb-16 md:pb-28')}>{children}</main>
      <OnboardingOverlay />
    </div>
  );
}
