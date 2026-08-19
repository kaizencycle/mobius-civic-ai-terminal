import type { EvidenceCacheDecision, EvidencePacket } from '@/lib/evidence/types';
import { DECISION_OPERATOR_LABEL, acquisitionOperatorLabel } from '@/lib/evidence/types';

const DECISION_CLASS: Record<EvidenceCacheDecision, string> = {
  FRESH_HIT: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200',
  STALE_ALLOWED: 'border-amber-500/40 bg-amber-950/30 text-amber-200',
  REVALIDATE: 'border-orange-500/40 bg-orange-950/30 text-orange-200',
  NEW_ACQUISITION: 'border-cyan-500/40 bg-cyan-950/30 text-cyan-200',
  LICENSE_DENIED: 'border-rose-500/40 bg-rose-950/30 text-rose-200',
  INDEPENDENT_SOURCE_REQUIRED: 'border-violet-500/40 bg-violet-950/30 text-violet-200',
};

export function EvidenceDecisionBadge({ decision }: { decision: EvidenceCacheDecision }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${DECISION_CLASS[decision]}`}
      aria-label={DECISION_OPERATOR_LABEL[decision]}
    >
      {DECISION_OPERATOR_LABEL[decision]}
    </span>
  );
}

export function FreshnessBadge({ status }: { status: EvidencePacket['freshness']['status'] }) {
  const cls =
    status === 'FRESH'
      ? 'text-emerald-300 border-emerald-700'
      : status === 'STALE'
        ? 'text-amber-300 border-amber-700'
        : 'text-rose-300 border-rose-700';
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-mono uppercase ${cls}`}>
      {status}
    </span>
  );
}

export function AcquisitionBadge({ packet }: { packet: EvidencePacket }) {
  const label = acquisitionOperatorLabel(packet.acquisition.acquisitionMode);
  const simulated = packet.acquisition.acquisitionMode === 'MOCK_X402';
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-mono uppercase ${
        simulated ? 'border-fuchsia-600 text-fuchsia-200' : 'border-slate-600 text-slate-300'
      }`}
    >
      {label}
    </span>
  );
}
