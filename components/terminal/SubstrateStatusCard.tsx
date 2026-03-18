import type { Sentinel } from '@/lib/terminal/types';
import { cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

const STATUS_COLORS: Record<Sentinel['status'], string> = {
  active: 'bg-emerald-500',
  standby: 'bg-slate-500',
  consensus: 'bg-amber-500',
  veto: 'bg-red-500',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'text-sky-300',
  openai: 'text-emerald-300',
  google: 'text-amber-300',
  meta: 'text-fuchsia-300',
};

export default function SubstrateStatusCard({
  sentinels,
  selectedId,
  onSelect,
}: {
  sentinels: Sentinel[];
  selectedId?: string;
  onSelect?: (sentinel: Sentinel) => void;
}) {
  const activeSentinels = sentinels.filter((s) => s.status !== 'standby').length;
  const avgIntegrity =
    sentinels.length > 0
      ? sentinels.reduce((sum, s) => sum + s.integrity, 0) / sentinels.length
      : 0;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Sentinel Council"
        subtitle="Mobius Substrate — multi-provider consensus"
      />

      <div className="mt-3 flex items-center gap-4">
        <div className="text-center">
          <div className="text-2xl font-mono font-semibold text-white">
            {activeSentinels}/{sentinels.length}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
            Active
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-mono font-semibold text-emerald-300">
            {avgIntegrity.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
            Avg MII
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-mono font-semibold text-amber-300">
            3/10
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
            Quorum
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {sentinels.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-4 text-sm font-sans text-slate-400">
            Sentinel council data is unavailable. Consensus preview remains in degraded mode until providers report in.
          </div>
        )}
        {sentinels.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect?.(s)}
            className={cn(
              'rounded-lg border p-2 text-left transition',
              selectedId === s.id
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-white">
                {s.name}
              </span>
              <div className={cn('h-2 w-2 rounded-full', STATUS_COLORS[s.status])} />
            </div>
            <div className={cn('mt-1 text-[10px] font-mono', PROVIDER_COLORS[s.provider] ?? 'text-slate-400')}>
              {s.provider}
            </div>
            <div className="mt-1 text-[10px] font-mono text-slate-500">
              MII {s.integrity.toFixed(2)}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
