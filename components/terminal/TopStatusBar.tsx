import { cn } from '@/lib/terminal/utils';

function Chip({
  label,
  tone = 'text-slate-300 border-slate-700 bg-slate-900',
}: {
  label: string;
  tone?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-md border px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.15em]',
        tone,
      )}
    >
      {label}
    </span>
  );
}

export default function TopStatusBar({
  clock,
  gi,
  alertCount,
}: {
  clock: string;
  gi: number;
  alertCount: number;
}) {
  const statuses = [
    {
      label: 'ATLAS',
      value: 'OK',
      tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
    },
    {
      label: 'ZEUS',
      value: 'ACTIVE',
      tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    },
    {
      label: 'ECHO',
      value: 'LIVE',
      tone: 'text-slate-200 border-slate-500/30 bg-slate-500/10',
    },
    {
      label: 'HERMES',
      value: 'ROUTING',
      tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
    },
    {
      label: 'TRIPWIRE',
      value: 'NOMINAL',
      tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <div className="text-sm font-mono font-semibold uppercase tracking-[0.28em] text-sky-300">
            Mobius Terminal
          </div>
          <div className="mt-1 text-xs font-sans text-slate-500">
            Civic Bloomberg Interface · Integrity Operating View
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip label="C-249" />
          <Chip label={clock || 'Loading...'} />
          <Chip
            label={`GI ${gi.toFixed(2)}`}
            tone="text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
          />
          <Chip
            label={`Alerts ${alertCount}`}
            tone="text-amber-300 border-amber-500/30 bg-amber-500/10"
          />
          {statuses.map((s) => (
            <Chip
              key={s.label}
              label={`${s.label} ${s.value}`}
              tone={s.tone}
            />
          ))}
        </div>
      </div>
    </header>
  );
}
