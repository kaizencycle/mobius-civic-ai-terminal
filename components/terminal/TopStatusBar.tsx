'use client';

import { useEffect, useState } from 'react';
import type { NavKey } from '@/lib/terminal/types';
import { cn, giScoreColor } from '@/lib/terminal/utils';

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
        'rounded-md border px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.15em] transition',
        tone,
        onClick ? 'hover:brightness-125 cursor-pointer' : 'cursor-default',
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
  gi,
  mii,
  micSupply,
  terminalStatus,
  primaryDriver,
  alertCount,
  cycleId = 'C-253',
  streamStatus = 'offline',
  onNavigate,
  onShowGI,
}: {
  gi: number;
  mii: number;
  micSupply: number;
  terminalStatus: 'nominal' | 'stressed' | 'critical';
  primaryDriver: string;
  alertCount: number;
  cycleId?: string;
  streamStatus?: StreamStatus;
  onNavigate: (key: NavKey) => void;
  onShowGI: () => void;
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
      <div className="flex items-center justify-between gap-4 px-4 py-3 max-md:pl-14">
        <div>
          <div className="text-sm font-mono font-semibold uppercase tracking-[0.28em] text-sky-300">
            Mobius Terminal
          </div>
          <div className="mt-1 text-xs font-sans text-slate-500 hidden sm:block">
            Civic Bloomberg Interface · Integrity Operating View
          </div>
          <div className="mt-1 hidden max-w-md truncate text-[10px] font-mono uppercase tracking-[0.12em] text-slate-600 lg:block">
            Driver · {primaryDriver}
          </div>
        </div>

        <div className="hidden sm:flex flex-wrap items-center justify-end gap-2">
          <Chip label={cycleId} onClick={() => onNavigate('pulse')} />
          <Chip label={clock || 'Loading...'} />
          <Chip label={`GI ${gi.toFixed(2)}`} tone={giScoreColor(gi).chip} onClick={onShowGI} />
          <Chip label={`MII ${mii.toFixed(2)}`} tone={mii >= 0.7 ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10'} onClick={() => onNavigate('wallet')} />
          <Chip label={`MIC ${micSupply.toLocaleString()}`} tone="text-violet-300 border-violet-500/30 bg-violet-500/10" onClick={() => onNavigate('wallet')} />
          <Chip label={terminalStatus} tone={statusTone} onClick={() => onNavigate('governance')} />
          <Chip
            label={`Alerts ${alertCount}`}
            tone="text-amber-300 border-amber-500/30 bg-amber-500/10"
            onClick={() => onNavigate('infrastructure')}
          />
          <Chip
            label={
              streamStatus === 'live' ? 'STREAM LIVE'
                : streamStatus === 'reconnecting' ? 'RECONNECTING'
                : 'OFFLINE'
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

        <div className="flex sm:hidden items-center gap-2">
          <Chip label={cycleId} onClick={() => onNavigate('pulse')} />
          <Chip label={`GI ${gi.toFixed(2)}`} tone={giScoreColor(gi).chip} onClick={onShowGI} />
          <Chip label={`MII ${mii.toFixed(2)}`} tone="text-cyan-300 border-cyan-500/30 bg-cyan-500/10" onClick={() => onNavigate('wallet')} />
          <Chip label={`${alertCount}`} tone="text-amber-300 border-amber-500/30 bg-amber-500/10" onClick={() => onNavigate('infrastructure')} />
        </div>
      </div>
    </header>
  );
}
