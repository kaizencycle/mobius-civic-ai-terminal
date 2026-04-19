'use client';

import type { MicReadinessResponse, MicRewardAttestationSummary } from '@/lib/mic/types';
import { FountainStatusCard } from '@/components/mic/FountainStatusCard';
import { MicAttestationTable } from '@/components/mic/MicAttestationTable';
import { MintReadinessBadge } from '@/components/mic/MintReadinessBadge';
import { QuorumStatusCard } from '@/components/mic/QuorumStatusCard';
import { SealStatusCard } from '@/components/mic/SealStatusCard';
import { VaultStatusCard } from '@/components/mic/VaultStatusCard';

export function MicStatusCard({
  readiness,
  attestations,
}: {
  readiness: MicReadinessResponse;
  attestations: MicRewardAttestationSummary[];
}) {
  const giLine =
    readiness.gi != null && Number.isFinite(readiness.gi)
      ? `${readiness.gi.toFixed(2)} / ${readiness.mintThresholdGi.toFixed(2)} threshold`
      : `— / ${readiness.mintThresholdGi.toFixed(2)} threshold`;

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-slate-950/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-violet-200">MIC runtime surface</h2>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Cycle {readiness.cycle} · GI {giLine}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-600">Schema {readiness.schema}</p>
        </div>
        <MintReadinessBadge mintReadiness={readiness.mintReadiness} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <VaultStatusCard reserve={readiness.reserve} />
        <SealStatusCard sustain={readiness.sustain} replay={readiness.replay} novelty={readiness.novelty} />
        <QuorumStatusCard quorum={readiness.quorum} />
        <FountainStatusCard fountain={readiness.fountain} />
      </div>

      <div className="mt-4">
        <MicAttestationTable rows={attestations} />
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
        Display-only: readiness is assembled on the server from Vault + GI + deposit sample. Policy and mint authorization
        remain in substrate / ledger services — not recomputed in the browser.
      </p>
    </div>
  );
}
