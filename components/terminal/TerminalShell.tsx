'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import ChamberSwitcher from '@/components/terminal/ChamberSwitcher';
import OnboardingOverlay from '@/components/terminal/OnboardingOverlay';
import ShellBridgeBanner from '@/components/terminal/ShellBridgeBanner';
import { DegradedBanner } from '@/components/terminal/DegradedBanner';
import SnapshotDiagnostics from '@/components/terminal/SnapshotDiagnostics';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import type { SnapshotLaneState } from '@/lib/terminal/snapshotLanes';
import { normalizeSnapshotLane, SNAPSHOT_LANE_KEYS } from '@/lib/terminal/snapshotLanes';
import { cn } from '@/lib/utils';
import { provenanceDescription, provenanceShortLabel } from '@/lib/terminal/memoryMode';

const SHELL_URL = 'https://mobius-browser-shell.vercel.app';

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

  const memoryMode = snapshot?.memory_mode;

  const gi = useMemo(() => {
    if (typeof memoryMode?.gi_value === 'number' && Number.isFinite(memoryMode.gi_value)) {
      return memoryMode.gi_value;
    }
    if (typeof snapshot?.gi === 'number' && Number.isFinite(snapshot.gi)) return snapshot.gi;
    if (typeof integrityData?.global_integrity === 'number') return integrityData.global_integrity;
    return null;
  }, [snapshot, integrityData, memoryMode]);

  const giProvenance = (memoryMode?.gi_provenance ?? null) as string | null;
  const giVerified = Boolean(memoryMode?.gi_verified);
  const provenanceLabel = provenanceShortLabel(giProvenance);
  const provenanceTitle = provenanceDescription(giProvenance);

  const provenanceBadge = useMemo(() => {
    const p = giProvenance ?? '';
    if (p === 'kv-live' || p === 'live-compute') return { label: provenanceLabel, cls: 'text-emerald-300/90' };
    if (p === 'kv-carry') return { label: provenanceLabel, cls: 'text-amber-300/90' };
    if (p === 'oaa-verified') return { label: provenanceLabel, cls: 'text-sky-300/90' };
    if (p === 'readiness-fallback') return { label: provenanceLabel, cls: 'text-orange-300/90' };
    return { label: provenanceLabel, cls: 'text-slate-500' };
  }, [giProvenance, provenanceLabel]);

  const cycle = snapshot?.cycle ?? integrityData?.cycle ?? 'C-—';
  const mode = (snapshot?.mode ?? integrityData?.mode ?? null)?.toString().toLowerCase() ?? null;

  const runtime = useMemo<'online' | 'degraded' | 'offline'>(() => {
    if (!snapshot && loading) return 'offline';
    if (!snapshot) return 'offline';
    if (snapshot.degraded || memoryMode?.degraded || mode === 'yellow' || mode === 'red') return 'degraded';
    return 'online';
  }, [snapshot, loading, mode, memoryMode]);

  const giTone = useMemo(() => {
    if (gi === null) return 'text-slate-400 border-slate-600';
    if (gi >= 0.85) return 'text-emerald-300 border-emerald-500/40';
    if (gi >= 0.7) return 'text-amber-300 border-amber-500/40';
    return 'text-rose-300 border-rose-500/40';
  }, [gi]);

  const snapshotAt = snapshot?.timestamp ?? null;
  const deployment = useMemo(() => {
    const raw = (snapshot as Record<string, unknown> | null)?.deployment;
    if (raw && typeof raw === 'object') {
      const d = raw as { commit_sha?: string | null; environment?: string | null };
      return { commit_sha: d.commit_sha ?? null, environment: d.environment ?? null };
    }
    return null;
  }, [snapshot]);

  const lanes = useMemo<SnapshotLaneState[]>(() => {
    if (!snapshot) return [];
    const out: SnapshotLaneState[] = [];
    for (const key of SNAPSHOT_LANE_KEYS) {
      const leaf = (snapshot as Record<string, unknown>)[key];
      if (leaf && typeof leaf === 'object') {
        const l = leaf as { ok?: boolean; status?: number; data?: unknown; error?: string | null };
        out.push(
          normalizeSnapshotLane(key, {
            ok: l.ok !== false,
            status: typeof l.status === 'number' ? l.status : (l.ok !== false ? 200 : 500),
            data: l.data ?? l,
            error: typeof l.error === 'string' ? l.error : null,
          }),
        );
      }
    }
    return out;
  }, [snapshot]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#020617] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur md:px-4 md:py-3">
        <div className="mb-1.5 flex items-center justify-between gap-2 md:mb-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="rounded border border-cyan-400/60 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] md:px-2 md:text-xs">⌘</div>
            <div className="text-[13px] font-semibold tracking-[0.04em] md:text-sm md:tracking-wide">MOBIUS CIVIC TERMINAL</div>
            <a
              href={SHELL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-violet-300 transition-colors hover:bg-violet-500/20 hover:text-violet-100 md:inline-block"
              title="Open Mobius Browser Shell (citizen entry)"
            >
              Shell
            </a>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono md:gap-2 md:text-[11px]">
            <span
              className={cn(
                'flex items-center gap-1 rounded border px-1.5 py-0.5 md:px-2 md:py-1',
                loading ? 'border-slate-700 text-slate-500' : giTone,
              )}
            >
              <span title={provenanceTitle}>
                GI {loading ? '—' : gi === null ? '—' : gi.toFixed(2)}
              </span>
              {!loading ? (
                <span
                  className={cn('rounded border border-white/10 px-1 font-mono text-[9px] uppercase', provenanceBadge.cls)}
                  title={provenanceTitle}
                >
                  {provenanceBadge.label}
                  {giVerified ? (
                    <span className="ml-0.5" title="Read from OAA warm-tier mirror (recorded value)">
                      ✓
                    </span>
                  ) : null}
                </span>
              ) : null}
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

      <DegradedBanner memoryMode={memoryMode ?? null} />

      {showLaneDiagnostics && lanes.length > 0 ? (
        <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2 md:px-4">
          <SnapshotDiagnostics lanes={lanes} snapshotAt={snapshotAt} deployment={deployment} />
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
