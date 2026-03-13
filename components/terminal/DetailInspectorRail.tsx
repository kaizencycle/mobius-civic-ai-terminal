import type { EpiconItem } from '@/lib/terminal/types';
import { confidenceLabel, cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-mono font-medium uppercase tracking-[0.18em] text-slate-500">
      {children}
    </div>
  );
}

function InspectorStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-sans font-medium text-slate-200">
        {value}
      </div>
    </div>
  );
}

export default function DetailInspectorRail({
  event,
}: {
  event: EpiconItem;
}) {
  return (
    <aside className="col-span-3 bg-slate-950/90">
      <div className="h-full p-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <SectionLabel
            title="Detail Inspector"
            subtitle="Why Mobius believes this"
          />

          <div className="mt-4 space-y-5">
            <div>
              <SmallLabel>Event</SmallLabel>
              <div className="mt-1 text-lg font-sans font-semibold text-white">
                {event.title}
              </div>
              <div className="mt-2 text-sm font-sans text-slate-300">
                {event.summary}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InspectorStat label="EPICON ID" value={event.id} />
              <InspectorStat label="Owner" value={event.ownerAgent} />
              <InspectorStat
                label="Status"
                value={event.status.toUpperCase()}
              />
              <InspectorStat
                label="Confidence"
                value={confidenceLabel(event.confidenceTier)}
              />
            </div>

            <div>
              <SmallLabel>Confidence Ladder</SmallLabel>
              <div className="mt-2 flex gap-2">
                {([0, 1, 2, 3, 4] as const).map((tier) => {
                  const active = tier <= event.confidenceTier;
                  return (
                    <div
                      key={tier}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-2 text-center text-[11px] font-mono uppercase tracking-[0.12em]',
                        active
                          ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                          : 'border-slate-800 bg-slate-950 text-slate-500',
                      )}
                    >
                      T{tier}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <SmallLabel>Source Stack</SmallLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {event.sources.map((source) => (
                  <span
                    key={source}
                    className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-mono text-slate-300"
                  >
                    {source}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <SmallLabel>Agent Trace</SmallLabel>
              <div className="mt-2 space-y-2">
                {event.trace.map((step, i) => (
                  <div
                    key={`${event.id}-${i}`}
                    className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-sans text-slate-300"
                  >
                    <span className="mr-2 font-mono text-slate-500">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SmallLabel>Operator Notes</SmallLabel>
              <div className="mt-2 rounded-lg border border-dashed border-slate-800 bg-slate-950 p-3 text-sm font-sans text-slate-400">
                No override applied. Event remains within normal review lane.
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
