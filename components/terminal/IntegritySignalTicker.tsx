import type { MobiusCivicIntegritySignal } from '@/lib/integrity-signal';
import { cn } from '@/lib/terminal/utils';

type Props = {
  signal: MobiusCivicIntegritySignal | null;
};

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function scoreTone(score: number): string {
  if (score >= 0.8) return 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10';
  if (score >= 0.5) return 'text-amber-400 border-amber-400/30 bg-amber-500/10';
  return 'text-red-400 border-red-400/30 bg-red-500/10';
}

export default function IntegritySignalTicker({ signal }: Props) {
  if (!signal) return null;

  const seoOk = signal.layers.seo_layer.primary_source_found;
  const geoOk = signal.layers.geo_layer.ai_consensus === 'aligned';
  const aeoOk = !signal.layers.aeo_layer.contradiction_detected;
  const showTripwire = signal.tripwire_status === 'triggered';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 tracking-[0.14em] text-sky-300">
          JADE
        </span>
        <span className="text-slate-400">{truncate(signal.signal_id, 18)}</span>
        <span className="text-slate-200">{truncate(signal.claim.text, 50)}</span>
        <span className={cn('rounded border px-2 py-1 font-semibold', scoreTone(signal.integrity_score))}>
          SCORE {signal.integrity_score.toFixed(3)}
        </span>

        <span className={cn('rounded border border-slate-700 px-2 py-1', seoOk ? 'text-emerald-300' : 'text-amber-300')}>
          SEO {seoOk ? '▣' : '□'}
        </span>
        <span className={cn('rounded border border-slate-700 px-2 py-1', geoOk ? 'text-emerald-300' : 'text-amber-300')}>
          GEO {geoOk ? '▣' : '□'}
        </span>
        <span className={cn('rounded border border-slate-700 px-2 py-1', aeoOk ? 'text-emerald-300' : 'text-red-300')}>
          AEO {aeoOk ? '▣' : '□'}
        </span>

        {showTripwire ? (
          <span className="animate-pulse rounded border border-red-500/30 px-2 py-1 text-red-500">
            ⚠ TRIPWIRE
          </span>
        ) : null}
      </div>
    </div>
  );
}
