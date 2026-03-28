'use client';

import { useEffect, useState } from 'react';
import GIMonitorBadge from '@/components/gi/GIMonitorBadge';
import MobiusIdentityBadge from '@/components/identity/MobiusIdentityBadge';
import type { NavKey } from '@/lib/terminal/types';
import type { IntegrityTone } from '@/components/terminal/LiveIntegrityRibbon';
import { cn } from '@/lib/terminal/utils';

/* ── Shared chip ─────────────────────────────────────────────── */

function Chip({
  label,
  tone = 'text-slate-300 border-slate-700 bg-slate-900/80',
  onClick,
  className,
}: {
  label: string;
  tone?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] transition whitespace-nowrap',
        tone,
        onClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
        className,
      )}
    >
      {label}
    </button>
  );
}

/* ── Tone helpers ────────────────────────────────────────────── */

const TONE_DOT: Record<IntegrityTone, string> = {
  stable: 'bg-emerald-400',
  watch: 'bg-amber-400',
  degraded: 'bg-red-400',
};

function giToneFrom(gi: number): IntegrityTone {
  return gi >= 0.9 ? 'stable' : gi >= 0.78 ? 'watch' : 'degraded';
}

function toneColor(tone: IntegrityTone) {
  return tone === 'stable'
    ? 'text-emerald-300'
    : tone === 'watch'
      ? 'text-amber-300'
      : 'text-red-300';
}

function toneBorder(tone: IntegrityTone) {
  return tone === 'stable'
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    : tone === 'watch'
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      : 'border-rose-500/20 bg-rose-500/10 text-rose-300';
}

/* ── Clock ───────────────────────────────────────────────────── */

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'America/New_York',
  hour12: false,
});

/* ── Stream status helpers ───────────────────────────────────── */

export type StreamStatus = 'live' | 'reconnecting' | 'offline' | 'local';

const STREAM_TONE: Record<StreamStatus, string> = {
  live: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  reconnecting: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  offline: 'text-slate-400 border-slate-600 bg-slate-800',
  local: 'text-sky-300/90 border-sky-500/25 bg-sky-500/10',
};

const STREAM_LABEL: Record<StreamStatus, string> = {
  live: 'STREAM LIVE',
  reconnecting: 'RECONNECTING',
  offline: 'OFFLINE',
  local: 'LOCAL',
};

/* ── Agent status chips ──────────────────────────────────────── */

const AGENT_STATUSES: {
  label: string;
  value: string;
  tone: string;
  nav: NavKey;
}[] = [
  { label: 'ATLAS', value: 'OK', tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10', nav: 'agents' },
  { label: 'ZEUS', value: 'ACTIVE', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10', nav: 'agents' },
  { label: 'ECHO', value: 'LIVE', tone: 'text-slate-200 border-slate-500/30 bg-slate-500/10', nav: 'agents' },
  { label: 'HERMES', value: 'ROUTING', tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10', nav: 'agents' },
  { label: 'TRIPWIRE', value: 'NOMINAL', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10', nav: 'infrastructure' },
];

/* ── Main component ──────────────────────────────────────────── */

export default function TopStatusBar({
  alertCount,
  mii,
  micSupply,
  terminalStatus,
  primaryDriver,
  cycleId = 'C-253',
  streamStatus = 'offline',
  onNavigate,
  // Integrity ribbon props (merged)
  gi = 0,
  micDelta = 0,
  tripwireState = 'stable' as IntegrityTone,
  lastLedgerSyncLabel = '--',
  lastIngestLabel = '--',
  lastCycleAdvanceLabel = '--',
}: {
  alertCount: number;
  mii: number;
  micSupply: number;
  terminalStatus: 'nominal' | 'stressed' | 'critical';
  primaryDriver: string;
  cycleId?: string;
  streamStatus?: StreamStatus;
  onNavigate: (key: NavKey) => void;
  // Integrity ribbon props
  gi?: number;
  micDelta?: number;
  tripwireState?: IntegrityTone;
  lastLedgerSyncLabel?: string;
  lastIngestLabel?: string;
  lastCycleAdvanceLabel?: string;
}) {
  const [clock, setClock] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const update = () => setClock(clockFormatter.format(new Date()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const giTone = giToneFrom(gi);
  const statusTone = terminalStatus === 'nominal'
    ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
    : terminalStatus === 'stressed'
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
      : 'text-red-300 border-red-500/30 bg-red-500/10';
  const micLabel = `${micDelta >= 0 ? '+' : ''}${micDelta.toFixed(1)}`;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      {/* ── Primary row: always visible ──────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 max-md:pl-12 sm:gap-3 sm:px-4">
        {/* Left: Brand + key metrics */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => onNavigate('pulse')}
            className="shrink-0 text-[11px] font-mono font-semibold uppercase tracking-[0.22em] text-sky-300 hover:text-sky-200 transition"
          >
            <span className="hidden sm:inline">Mobius Terminal</span>
            <span className="sm:hidden">MOBIUS</span>
          </button>

          {/* Pulse dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', TONE_DOT[tripwireState])} />
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', TONE_DOT[tripwireState])} />
          </span>

          {/* Inline key metrics */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono min-w-0 overflow-hidden">
            <span className={cn('shrink-0 font-semibold', toneColor(giTone))}>
              GI {gi.toFixed(2)}
            </span>
            <span className="text-slate-600 shrink-0 max-sm:hidden">·</span>
            <span className={cn('shrink-0 max-sm:hidden', toneColor(tripwireState))}>
              {tripwireState.toUpperCase()}
            </span>
            <span className="text-slate-600 shrink-0 max-sm:hidden">·</span>
            <span className="text-slate-400 shrink-0 max-sm:hidden">{cycleId}</span>
          </div>
        </div>

        {/* Right: Status chips + expand toggle */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* Stream status — always visible */}
          <Chip
            label={STREAM_LABEL[streamStatus]}
            tone={STREAM_TONE[streamStatus]}
            className="max-sm:px-1.5"
          />

          {/* Desktop-only chips */}
          <div className="hidden md:flex items-center gap-1.5">
            <Chip label={clock || '--:--:--'} />
            <GIMonitorBadge />
            <MobiusIdentityBadge />
            <Chip
              label={`MII ${mii.toFixed(2)}`}
              tone={mii >= 0.7 ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10'}
              onClick={() => onNavigate('wallet')}
            />
            <Chip
              label={`MIC ${micSupply.toLocaleString()}`}
              tone="text-violet-300 border-violet-500/30 bg-violet-500/10"
              onClick={() => onNavigate('wallet')}
            />
            <Chip
              label={terminalStatus}
              tone={statusTone}
              onClick={() => onNavigate('governance')}
            />
            <Chip
              label={`Alerts ${alertCount}`}
              tone={alertCount > 0 ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-slate-400 border-slate-700 bg-slate-900/80'}
              onClick={() => onNavigate('infrastructure')}
            />
          </div>

          {/* Expand / collapse toggle */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] font-mono text-slate-400 transition hover:text-slate-200 hover:border-slate-600',
              expanded && 'bg-sky-500/10 border-sky-500/30 text-sky-300',
            )}
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            <span className={cn('transition-transform duration-200', expanded && 'rotate-180')}>▾</span>
          </button>
        </div>
      </div>

      {/* ── Expanded detail panel ────────────────────────────── */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          expanded ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="border-t border-slate-800/60 px-3 pb-3 pt-2 sm:px-4">
          {/* Driver line */}
          <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 truncate">
            Driver · {primaryDriver}
          </div>

          {/* Metric chips grid */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip label={`Cycle ${cycleId}`} onClick={() => onNavigate('pulse')} />
            <Chip label={`GI ${gi.toFixed(2)}`} tone={toneBorder(giTone)} onClick={() => onNavigate('governance')} />
            <Chip
              label={`MII ${mii.toFixed(2)}`}
              tone={toneBorder(mii >= 0.9 ? 'stable' : mii >= 0.78 ? 'watch' : 'degraded')}
              onClick={() => onNavigate('wallet')}
            />
            <Chip
              label={`MIC Δ ${micLabel}`}
              tone={toneBorder(micDelta >= 0 ? 'stable' : 'degraded')}
              onClick={() => onNavigate('wallet')}
            />
            <Chip
              label={`MIC ${micSupply.toLocaleString()}`}
              tone="text-violet-300 border-violet-500/30 bg-violet-500/10"
              onClick={() => onNavigate('wallet')}
            />
            <Chip
              label={`Tripwire ${tripwireState.toUpperCase()}`}
              tone={toneBorder(tripwireState)}
              onClick={() => onNavigate('infrastructure')}
            />
            <Chip label={`Ledger ${lastLedgerSyncLabel}`} onClick={() => onNavigate('ledger')} />
            <Chip label={`Ingest ${lastIngestLabel}`} onClick={() => onNavigate('pulse')} />
            <Chip label={`Advance ${lastCycleAdvanceLabel}`} onClick={() => onNavigate('pulse')} />
            <Chip
              label={terminalStatus}
              tone={statusTone}
              onClick={() => onNavigate('governance')}
            />
            <Chip
              label={`Alerts ${alertCount}`}
              tone={alertCount > 0 ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-slate-400 border-slate-700 bg-slate-900/80'}
              onClick={() => onNavigate('infrastructure')}
            />
            <Chip
              label={`Stream ${STREAM_LABEL[streamStatus]}`}
              tone={STREAM_TONE[streamStatus]}
            />
          </div>

          {/* Agent status row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-600 mr-1">Agents</span>
            {AGENT_STATUSES.map((s) => (
              <Chip
                key={s.label}
                label={`${s.label} ${s.value}`}
                tone={s.tone}
                onClick={() => onNavigate(s.nav)}
              />
            ))}
          </div>

          {/* Mobile-only: show identity + GI badges */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 md:hidden">
            <GIMonitorBadge />
            <MobiusIdentityBadge />
            <Chip label={clock || '--:--:--'} />
          </div>
        </div>
      </div>
    </header>
  );
}
