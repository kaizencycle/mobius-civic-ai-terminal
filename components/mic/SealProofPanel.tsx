'use client';

import type { MicSealSnapshot } from '@/lib/mic/types';
import { ChainIntegrityCard } from '@/components/mic/ChainIntegrityCard';

export function SealProofPanel({ seal }: { seal: MicSealSnapshot }) {
  return (
    <div className="rounded-2xl border border-cyan-900/35 bg-slate-950/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-300/90">Seal snapshot</h2>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
            {seal.type ?? 'MIC_SEAL_V1'} · {seal.cycle}
          </p>
        </div>
        <div className="text-[10px] text-slate-500">{seal.timestamp}</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1 font-mono text-[11px] text-slate-300">
          <div>GI: {seal.gi.toFixed(4)}</div>
          <div>
            Reserve: {seal.reserve.inProgressBalance.toFixed(4)} / {seal.reserve.trancheTarget.toFixed(2)}
          </div>
          <div>Sealed total: {seal.reserve.sealedReserveTotal.toFixed(2)}</div>
          <div>Tranche: {seal.reserve.trancheStatus}</div>
          <div>
            Sustain: {seal.sustain.consecutiveEligibleCycles} / {seal.sustain.requiredCycles} ({seal.sustain.status})
          </div>
          <div>Replay: {seal.replay.status}</div>
          <div>Novelty: {seal.novelty.status}</div>
          <div>Quorum: {seal.quorum.status}</div>
        </div>
        <ChainIntegrityCard
          hash={seal.hash}
          previousHash={seal.previous_hash}
          algorithm={seal.hash_algorithm ?? 'sha256'}
        />
      </div>
    </div>
  );
}
