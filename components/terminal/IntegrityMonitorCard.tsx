import type { GISnapshot } from '@/lib/terminal/types';
import SectionLabel from './SectionLabel';

function MetricRow({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm font-sans">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400 font-mono">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800">
        <div
          className="h-2 rounded-full bg-sky-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function IntegrityMonitorCard({
  gi,
  onClick,
}: {
  gi: GISnapshot;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-slate-700 hover:bg-slate-900/80"
    >
      <SectionLabel title="GI Monitor" subtitle="Civic integrity signal" />
      <div className="mt-4 flex items-end gap-3">
        <div className="text-4xl font-mono font-semibold text-white">
          {gi.score.toFixed(2)}
        </div>
        <div className="pb-1 text-sm font-mono text-emerald-300">
          {gi.delta > 0
            ? `▲ +${gi.delta.toFixed(2)}`
            : gi.delta < 0
              ? `▼ ${gi.delta.toFixed(2)}`
              : `${gi.delta.toFixed(2)}`}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <MetricRow label="Institutional Trust" value={gi.institutionalTrust} />
        <MetricRow label="Info Reliability" value={gi.infoReliability} />
        <MetricRow
          label="Consensus Stability"
          value={gi.consensusStability}
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500">
          Weekly Trend
        </div>
        <div className="flex h-16 items-end gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          {gi.weekly.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-sky-500/80 transition-all duration-500"
              style={{ height: `${Math.max(12, v * 60)}px` }}
            />
          ))}
        </div>
      </div>
    </button>
  );
}
