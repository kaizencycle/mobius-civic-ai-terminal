import type { EveReserveShard, ReviewAgent, ReviewVerdict } from '@/lib/epicon/shards/compiler/types';

export type StoredShardProposal = {
  id: string;
  cycleId: string;
  createdAt: string;
  updatedAt: string;
  document: EveReserveShard;
  reviews: Partial<Record<ReviewAgent, ReviewVerdict>>;
};

const proposals = new Map<string, StoredShardProposal>();
const seqByCycle = new Map<string, number>();

export function allocateShardProposalId(cycleId: string): string {
  const normalized = cycleId.trim().toUpperCase().startsWith('C-')
    ? cycleId.trim().toUpperCase()
    : `C-${cycleId.replace(/[^0-9]/g, '').padStart(3, '0').slice(-3)}`;
  const next = (seqByCycle.get(normalized) ?? 0) + 1;
  seqByCycle.set(normalized, next);
  return `SHARD_${normalized}_EVE_${String(next).padStart(3, '0')}`;
}

export function saveShardProposal(proposal: StoredShardProposal): void {
  proposals.set(proposal.id, proposal);
}

export function getShardProposal(id: string): StoredShardProposal | null {
  return proposals.get(id) ?? null;
}

export function listShardProposals(): StoredShardProposal[] {
  return [...proposals.values()];
}

export function updateShardReview(
  id: string,
  agent: ReviewAgent,
  verdict: ReviewVerdict,
): StoredShardProposal | null {
  const existing = proposals.get(id);
  if (!existing) {
    return null;
  }

  const updated: StoredShardProposal = {
    ...existing,
    updatedAt: new Date().toISOString(),
    reviews: {
      ...existing.reviews,
      [agent]: verdict,
    },
    document: {
      ...existing.document,
      verification: {
        ...existing.document.verification,
        [agent]: verdict,
      },
      shard: {
        ...existing.document.shard,
        status:
          verdict === 'fail'
            ? 'quarantined'
            : verdict === 'clarify'
              ? 'clarify'
              : existing.document.shard.status,
      },
    },
  };

  proposals.set(id, updated);
  return updated;
}
