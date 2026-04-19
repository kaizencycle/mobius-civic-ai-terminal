'use client';

import type { MicRewardAttestationSummary } from '@/lib/mic/types';
import { ChainIntegrityCard } from '@/components/mic/ChainIntegrityCard';

export function AttestationProofPanel({ attestation }: { attestation: MicRewardAttestationSummary }) {
  return (
    <div className="rounded-xl border border-emerald-900/35 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">Attestation proof</h3>
          <p className="mt-1 font-mono text-[11px] text-slate-300">
            {attestation.nodeId} · {attestation.mic.toFixed(4)} reserve units
          </p>
        </div>
        <div className="text-[10px] text-slate-500">{attestation.timestamp}</div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-1 font-mono text-[11px] text-slate-300">
          <div>Type: {attestation.type ?? 'MIC_REWARD_V2'}</div>
          <div>Source: {attestation.source ?? '—'}</div>
          <div>GI multiplier (dep/J): {attestation.breakdown?.multipliers?.giMultiplier ?? '—'}</div>
          <div>Consensus: {attestation.breakdown?.multipliers?.consensusMultiplier ?? '—'}</div>
          <div>Novelty: {attestation.breakdown?.multipliers?.noveltyMultiplier ?? '—'}</div>
          <div>Anti-drift: {attestation.breakdown?.multipliers?.antiDriftMultiplier ?? '—'}</div>
        </div>
        <ChainIntegrityCard
          hash={attestation.hash}
          previousHash={attestation.previous_hash}
          algorithm={attestation.hash_algorithm ?? 'sha256'}
        />
      </div>
    </div>
  );
}
