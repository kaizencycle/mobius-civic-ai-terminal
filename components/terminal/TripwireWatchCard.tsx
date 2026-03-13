import type { Tripwire } from '@/lib/terminal/types';
import { tripwireStyle, cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

export default function TripwireWatchCard({
  tripwires,
}: {
  tripwires: Tripwire[];
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel title="Tripwire Watch" subtitle="Substrate anomalies" />
      <div className="mt-3 space-y-3">
        {tripwires.map((t) => (
          <div
            key={t.id}
            className={cn('rounded-lg border p-3', tripwireStyle(t.severity))}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-sans font-semibold">{t.label}</div>
                <div className="mt-1 text-xs font-sans opacity-80">
                  {t.action}
                </div>
              </div>
              <div className="text-right text-[11px] font-mono opacity-80">
                <div>{t.id}</div>
                <div>{t.openedAt}</div>
              </div>
            </div>
            <div className="mt-2 text-[11px] font-mono uppercase tracking-[0.15em] opacity-80">
              Owner: {t.owner}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
