'use client';

import type { MicReadinessResponse } from '@/lib/mic/types';

export function QuorumStatusCard({ quorum }: { quorum: MicReadinessResponse['quorum'] }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Seal quorum</h3>
      <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
        <div>Required: {quorum.required.join(', ')}</div>
        <div>
          Attestations received: {quorum.attestations_received} · remaining slots: {quorum.attestations_needed}
        </div>
        <div>Status: {quorum.status}</div>
        <div>Candidate in flight: {String(quorum.seal_candidate_in_flight)}</div>
        {quorum.attested.length > 0 ? <div>Attested agents: {quorum.attested.join(', ')}</div> : null}
      </div>
    </div>
  );
}
