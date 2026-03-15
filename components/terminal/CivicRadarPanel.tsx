import type { CivicRadarAlert } from '@/lib/terminal/types';
import { cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

const SEVERITY_STYLES: Record<CivicRadarAlert['severity'], string> = {
  critical: 'text-red-300 border-red-500/30 bg-red-500/10',
  high: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  medium: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10',
  low: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  info: 'text-slate-300 border-slate-500/30 bg-slate-500/10',
};

const CATEGORY_STYLES: Record<CivicRadarAlert['category'], string> = {
  misinformation: 'text-amber-300',
  privacy: 'text-red-300',
  manipulation: 'text-fuchsia-300',
  infrastructure: 'text-sky-300',
  governance: 'text-emerald-300',
};

export default function CivicRadarPanel({
  alerts,
  selectedId,
  onSelect,
}: {
  alerts: CivicRadarAlert[];
  selectedId?: string;
  onSelect?: (alert: CivicRadarAlert) => void;
}) {
  const criticalCount = alerts.filter(
    (a) => a.severity === 'critical' || a.severity === 'high',
  ).length;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Civic Radar"
        subtitle="Browser Shell — threat intelligence feed"
      />

      {criticalCount > 0 && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-300">
          {criticalCount} critical/high severity alert{criticalCount > 1 ? 's' : ''} active
        </div>
      )}

      <div className="mt-3 space-y-2">
        {alerts.map((alert) => (
          <button
            key={alert.id}
            onClick={() => onSelect?.(alert)}
            className={cn(
              'w-full rounded-lg border p-3 text-left transition',
              selectedId === alert.id
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em]',
                      SEVERITY_STYLES[alert.severity],
                    )}
                  >
                    {alert.severity}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-mono uppercase tracking-[0.1em]',
                      CATEGORY_STYLES[alert.category],
                    )}
                  >
                    {alert.category}
                  </span>
                </div>
                <div className="mt-1.5 text-sm font-sans text-slate-200">
                  {alert.title}
                </div>
                <div className="mt-1 text-xs font-sans text-slate-400">
                  {alert.impact}
                </div>
              </div>

              <div className="shrink-0 text-right text-[10px] font-mono text-slate-500">
                <div>{alert.id}</div>
                <div className="mt-1">{alert.timestamp}</div>
              </div>
            </div>

            <div className="mt-2 text-[10px] font-mono text-slate-500">
              Source: {alert.source}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
