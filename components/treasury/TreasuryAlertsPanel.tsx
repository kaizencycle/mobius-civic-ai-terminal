'use client';

import type { TreasuryCivicAlert, TreasuryTripwire } from '@/lib/treasury/alerts';

function severityTone(severity: string) {
  if (severity === 'critical' || severity === 'high') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  }
  if (severity === 'stressed' || severity === 'medium' || severity === 'partial') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }
  if (severity === 'watch') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  }
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
}

export default function TreasuryAlertsPanel({
  status,
  tripwires,
  alerts,
}: {
  status: 'nominal' | 'watch' | 'stressed' | 'critical';
  tripwires: TreasuryTripwire[];
  alerts: TreasuryCivicAlert[];
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Fiscal Alert Engine</div>
          <div className="mt-1 text-xs text-slate-400">ECHO canonical tripwires for Treasury Watch</div>
        </div>
        <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${severityTone(status)}`}>{status}</div>
      </div>

      <div className="mt-4 space-y-2">
        {tripwires.length === 0 && alerts.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-500">
            No active Treasury alert engine outputs.
          </div>
        ) : null}

        {tripwires.map((item) => (
          <div key={item.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-white">{item.label}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  {item.layer} · {item.category}
                </div>
              </div>
              <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${severityTone(item.severity)}`}>
                {item.severity}
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400">{item.action}</div>
          </div>
        ))}

        {alerts.map((item) => (
          <div key={item.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-white">{item.title}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  {item.category} · {item.source}
                </div>
              </div>
              <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${severityTone(item.severity)}`}>
                {item.severity}
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400">{item.impact}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
