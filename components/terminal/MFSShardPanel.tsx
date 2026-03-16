'use client';

/**
 * MFS Shard Portfolio Panel — Mobius Fractal Shards visualization.
 *
 * Shows the 7 shard archetypes with weights, scores, and contribution bars.
 * Adapted from mobius-browser-shell WalletLab shard section, dark theme.
 */

import SectionLabel from './SectionLabel';
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';

const SHARD_ARCHETYPES = [
  { id: 'CIV', name: 'Civic', weight: 0.25, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', bar: 'bg-amber-500' },
  { id: 'REF', name: 'Reflection', weight: 0.20, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', bar: 'bg-indigo-500' },
  { id: 'LRN', name: 'Learning', weight: 0.15, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-500' },
  { id: 'STB', name: 'Stability', weight: 0.15, color: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/30', bar: 'bg-slate-400' },
  { id: 'STW', name: 'Stewardship', weight: 0.10, color: 'text-stone-400', bg: 'bg-stone-500/10', border: 'border-stone-500/30', bar: 'bg-stone-500' },
  { id: 'INV', name: 'Innovation', weight: 0.10, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', bar: 'bg-violet-500' },
  { id: 'GRD', name: 'Guardian', weight: 0.05, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', bar: 'bg-red-500' },
] as const;

// Map integrity engine shard types to archetype IDs
const SHARD_TYPE_TO_ID: Record<string, string> = {
  civic: 'CIV',
  reflection: 'REF',
  learning: 'LRN',
  stability: 'STB',
  stewardship: 'STW',
  innovation: 'INV',
  guardian: 'GRD',
};

export default function MFSShardPanel({
  integrity,
}: {
  integrity: CycleIntegritySummary | null;
}) {
  // Compute per-archetype scores from integrity ratings
  const shardScores: Record<string, { count: number; totalMic: number }> = {};
  if (integrity) {
    for (const rating of integrity.ratings) {
      const archetypeId = SHARD_TYPE_TO_ID[rating.shardType] ?? 'CIV';
      if (!shardScores[archetypeId]) shardScores[archetypeId] = { count: 0, totalMic: 0 };
      shardScores[archetypeId].count += 1;
      shardScores[archetypeId].totalMic += rating.micMinted;
    }
  }

  const totalShards = integrity
    ? integrity.ratings.length
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel title="Mobius Fractal Shards" subtitle="Soulbound contribution proofs across 7 archetypes" />
        <span className="text-[10px] font-mono text-slate-500">
          Shards: {totalShards}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Soulbound Visualizer */}
        <div className="hidden sm:flex col-span-1 row-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="relative w-24 h-24 mb-4">
            <div className="absolute inset-0 border border-emerald-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
            <div className="absolute inset-2 border border-indigo-500/20 rounded-full animate-[spin_7s_linear_infinite_reverse]" />
            <div className="absolute inset-4 border border-amber-500/20 rounded-full animate-[spin_5s_linear_infinite]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-serif text-slate-200 mb-1">Soulbound</h3>
          <p className="text-[10px] text-slate-500 max-w-[160px]">
            Non-transferable proofs of contribution.
          </p>
        </div>

        {/* Shard Archetype Cards */}
        {SHARD_ARCHETYPES.map((shard) => {
          const score = shardScores[shard.id];
          const count = score?.count ?? 0;
          const mic = score?.totalMic ?? 0;
          const barPercent = Math.min(count * 15, 100);

          return (
            <div
              key={shard.id}
              className={`rounded-lg border ${shard.border} ${shard.bg} p-3 transition-colors`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className={`p-1.5 rounded-md ${shard.bg} ${shard.color}`}>
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
                  </svg>
                </div>
                <span className="font-mono text-base font-bold text-slate-200">{count}</span>
              </div>
              <h4 className="font-medium text-slate-200 text-xs">{shard.name}</h4>
              <div className="flex items-center justify-between text-[9px] text-slate-500 mt-0.5 mb-1.5">
                <span>W: {shard.weight}</span>
                <span>+{mic.toFixed(4)}</span>
              </div>
              <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${shard.bar} transition-all duration-500`} style={{ width: `${barPercent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
