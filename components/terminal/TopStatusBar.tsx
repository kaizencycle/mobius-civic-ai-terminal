'use client';

import { useEffect, useState } from 'react';
import TerminalNav from '@/components/layout/TerminalNav';
import GIMonitorBadge from '@/components/gi/GIMonitorBadge';
import MobiusIdentityBadge from '@/components/identity/MobiusIdentityBadge';
import type { NavKey } from '@/lib/terminal/types';
import { cn } from '@/lib/terminal/utils';

function Chip({
  label,
  tone = 'text-slate-300 border-slate-700 bg-slate-900',
  onClick,
}: {
  label: string;
  tone?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2 text-[11px] font-mono uppercase tracking-[0.15em] transition',
        tone,
        onClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
      )}
    >
      {label}
    </button>
  );
}

const STATUSES: {
  label: string;
  value: string;
  tone: string;
  nav: NavKey;
}[] = [
  {
    label: 'ATLAS',
    value: 'OK',
    tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
    nav: 'agents',
  },
  {
    label: 'ZEUS',
    value: 'ACTIVE',
    tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    nav: 'agents',
  },
  {
    label: 'ECHO',
    value: 'LIVE',
    tone: 'text-slate-200 border-slate-500/30 bg-slate-500/10',
    nav: 'agents',
  },
  {
    label: 'HERMES',
    value: 'ROUTING',
    tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
    nav: 'agents',
  },
  {
    label: 'TRIPWIRE',
    value: 'NOMINAL',
    tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    nav: 'infrastructure',
  },
];

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'America/New_York',
});

export type StreamStatus = 'live' | 'reconnecting' | 'offline';

export default function TopStatusBar({
  mii,
  micSupply,
  terminalStatus,
  primaryDriver,
  alertCount,
  cycleId = 'C-253',
  streamStatus = 'offline',
  onNavigate,
}: {
  mii: number;
  micSupply: number;
  terminalStatus: 'nominal' | 'stressed' | 'critical';
  primaryDriver: string;
  alertCount: number;
  cycleId?: string;
  streamStatus?: StreamStatus;
  onNavigate: (key: NavKey) => void;
}) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const update = () => setClock(clockFormatter.format(new Date()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const statusTone = terminalStatus === 'nominal'
    ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
    : terminalStatus === 'stressed'
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
      : 'text-red-300 border-red-500/30 bg-red-500/10';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="px-4 py-3 max-md:pl-14">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-mono font-semibold uppercase tracking-[0.28em] text-sky-300">
                Mobius Terminal
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Civic Bloomberg Interface · Integrity Operating View
              </div>
              <div className="mt-1 max-w-2xl text-[10px] font-mono uppercase tracking-[0.12em] text-slate-600">
                Primary driver · {primaryDriver}
              </div>
            </div>
            <TerminalNav />
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
            <Chip label={cycleId} onClick={() => onNavigate('pulse')} />
            <Chip label={clock || 'Loading...'} />
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
            <Chip label={terminalStatus} tone={statusTone} onClick={() => onNavigate('governance')} />
            <Chip
              label={`Alerts ${alertCount}`}
              tone="text-amber-300 border-amber-500/30 bg-amber-500/10"
              onClick={() => onNavigate('infrastructure')}
            />
            <Chip
              label={
                streamStatus === 'live' ? 'Stream live'
                  : streamStatus === 'reconnecting' ? 'Reconnecting'
                  : 'Offline'
              }
              tone={
                streamStatus === 'live' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                  : streamStatus === 'reconnecting' ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                  : 'text-slate-400 border-slate-600 bg-slate-800'
              }
            />
            {STATUSES.map((s) => (
              <Chip
                key={s.label}
                label={`${s.label} ${s.value}`}
                tone={s.tone}
                onClick={() => onNavigate(s.nav)}
              />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
