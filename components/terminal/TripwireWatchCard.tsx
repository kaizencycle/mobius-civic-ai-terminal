import { useEffect, useState } from 'react';
import type { Tripwire, TripwireLayer } from '@/lib/terminal/types';
import type { DataSource } from '@/lib/response-envelope';
import { tripwireStyle, cn } from '@/lib/terminal/utils';
import DataSourceBadge from './DataSourceBadge';
import SectionLabel from './SectionLabel';

const LAYER_COLORS: Record<TripwireLayer, string> = {
  information: 'text-sky-300 border-sky-500/20 bg-sky-500/10',
  market: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
  infrastructure: 'text-orange-300 border-orange-500/20 bg-orange-500/10',
  governance: 'text-violet-300 border-violet-500/20 bg-violet-500/10',
  cognitive: 'text-rose-300 border-rose-500/20 bg-rose-500/10',
  system: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10',
};

export default function TripwireWatchCard({
  tripwires,
  selectedId,
  onSelect,
}: {
  tripwires: Tripwire[];
  selectedId?: string;
  onSelect?: (tripwire: Tripwire) => void;
}) {
  const autoCount = tripwires.filter((t) => t.autoDetected).length;
  const [source, setSource] = useState<DataSource>('mock');
  const [freshAt, setFreshAt] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadStatus() {
      try {
        const res = await fetch('/api/tripwire/status', { cache: 'no-store' });
        const json = (await res.json()) as {
          source?: DataSource;
          freshAt?: string | null;
          degraded?: boolean;
        };
        if (!alive) return;
        setSource(json.source ?? 'mock');
        setFreshAt(json.freshAt ?? null);
        setDegraded(Boolean(json.degraded));
      } catch {
        // Keep prior status if refresh fails.
      }
    }

    loadStatus();
    const interval = setInterval(loadStatus, 15000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      className={cn(
        'rounded-xl border bg-slate-900/60 p-4',
        degraded ? 'border-amber-500/40' : 'border-slate-800'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <SectionLabel title="Tripwire Watch" subtitle="Substrate anomalies" />
          <DataSourceBadge source={source} freshAt={freshAt} degraded={degraded} />
        </div>
        <div className="flex items-center gap-2">
          {autoCount > 0 && (
            <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-300">
              {autoCount} auto
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {tripwires.length === 0 && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm font-sans text-emerald-300">
            No active tripwires. Substrate posture is nominal and ready for new watch conditions.
          </div>
        )}
        {tripwires.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect?.(t)}
            className={cn(
              'w-full rounded-lg border p-3 text-left transition',
              selectedId === t.id
                ? 'ring-1 ring-sky-500/40 ' + tripwireStyle(t.severity)
                : tripwireStyle(t.severity) + ' hover:brightness-125',
            )}
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

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.15em] opacity-80">
                Owner: {t.owner}
              </span>

              {t.layer && (
                <span
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em]',
                    LAYER_COLORS[t.layer],
                  )}
                >
                  {t.layer}
                </span>
              )}

              {t.autoDetected && (
                <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-300">
                  auto
                </span>
              )}

              {t.triggerMetric && t.triggerValue !== undefined && (
                <span className="text-[10px] font-mono text-slate-500">
                  {t.triggerMetric}: {typeof t.triggerValue === 'number' && t.triggerValue % 1 !== 0 ? t.triggerValue.toFixed(3) : t.triggerValue}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      {degraded ? (
        <div className="mt-3 text-xs text-amber-300">
          Showing mock/cached data — live source offline
        </div>
      ) : null}
    </div>
  );
}
