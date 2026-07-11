import type { EveReserveShard, ReviewAgent, ReviewVerdict } from '@/lib/epicon/shards/compiler/types';
import { syncShardQuorumStatus } from '@/lib/epicon/shards/quorum-gate';

export type StoredShardProposal = {
  id: string;
  cycleId: string;
  createdAt: string;
  updatedAt: string;
  document: EveReserveShard;
  reviews: Partial<Record<ReviewAgent, ReviewVerdict>>;
  quorumPacketId?: string;
  ledgerCommitId?: string;
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

  let updated: StoredShardProposal = {
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

  updated = syncShardQuorumStatus(updated);
  proposals.set(id, updated);
  return updated;
}

export function replaceShardProposal(proposal: StoredShardProposal): StoredShardProposal {
  proposals.set(proposal.id, proposal);
  return proposal;
}

export type ShardCommitReservation =
  | { ok: true; proposal: StoredShardProposal }
  | { ok: false; reason: 'not_found' | 'already_committed' };

/** Atomically reserve a proposal for ledger commit before any async I/O. */
export function reserveShardLedgerCommit(id: string): ShardCommitReservation {
  const existing = proposals.get(id);
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }

  if (existing.document.pipeline_status.ledger_status !== 'not_ingested') {
    return { ok: false, reason: 'already_committed' };
  }

  const reserved: StoredShardProposal = {
    ...existing,
    updatedAt: new Date().toISOString(),
    document: {
      ...existing.document,
      pipeline_status: {
        ...existing.document.pipeline_status,
        ledger_status: 'candidate_committed',
      },
    },
  };

  proposals.set(id, reserved);
  return { ok: true, proposal: reserved };
}

/** Roll back an optimistic commit reservation when ledger write fails. */
export function rollbackShardLedgerCommit(id: string): void {
  const existing = proposals.get(id);
  if (!existing || existing.ledgerCommitId) {
    return;
  }

  if (existing.document.pipeline_status.ledger_status !== 'candidate_committed') {
    return;
  }

  proposals.set(id, {
    ...existing,
    updatedAt: new Date().toISOString(),
    document: {
      ...existing.document,
      pipeline_status: {
        ...existing.document.pipeline_status,
        ledger_status: 'not_ingested',
      },
    },
  });
}
