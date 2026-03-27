import { scienceOverviewMetrics } from '@/lib/science/mock';

export default function ScienceChamberOverviewCard() {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Science Chamber</div>
      <div className="mt-1 text-sm text-slate-300">First-pass synthesis surface for science-native signals in Mobius Terminal.</div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {scienceOverviewMetrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{metric.label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{metric.value}</div>
            <div className="mt-1 text-xs text-slate-400">{metric.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
