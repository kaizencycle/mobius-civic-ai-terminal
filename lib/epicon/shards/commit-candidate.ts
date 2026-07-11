import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { buildShardCandidateLedgerEntry } from '@/lib/epicon/shards/build-shard-ledger-entry';
import {
  buildShardQuorumDecision,
  buildShardQuorumPacket,
} from '@/lib/epicon/shards/build-shard-quorum-packet';
import { isShardQuorumReady, isShardStatusQuorumEligible } from '@/lib/epicon/shards/quorum-gate';
import {
  reserveShardLedgerCommit,
  rollbackShardLedgerCommit,
  type StoredShardProposal,
} from '@/lib/epicon/shards/store';
import { writeToSubstrate } from '@/lib/substrate/client';

export type ShardCommitResult = {
  ledgerEntryId: string;
  ledgerPosition: number | null;
  quorumPacketId: string;
  substrate: { ok: boolean; entryId?: string; error?: string };
};

export class ShardCommitError extends Error {
  constructor(
    message: string,
    readonly code: 'not_quorum_ready' | 'already_committed' | 'quarantined',
  ) {
    super(message);
    this.name = 'ShardCommitError';
  }
}

export async function commitShardCandidate(
  proposal: StoredShardProposal,
): Promise<{ proposal: StoredShardProposal; commit: ShardCommitResult }> {
  const reservation = reserveShardLedgerCommit(proposal.id);
  if (!reservation.ok) {
    if (reservation.reason === 'already_committed') {
      throw new ShardCommitError('Shard candidate already committed to ledger', 'already_committed');
    }
    throw new ShardCommitError('Shard proposal not found', 'not_quorum_ready');
  }

  let working = reservation.proposal;

  try {
    if (working.document.shard.status === 'quarantined') {
      throw new ShardCommitError('Shard proposal is quarantined', 'quarantined');
    }

    if (!isShardStatusQuorumEligible(working.document.shard.status)) {
      throw new ShardCommitError(
        `Shard status ${working.document.shard.status} is not quorum-eligible`,
        'not_quorum_ready',
      );
    }

    if (!isShardQuorumReady(working)) {
      throw new ShardCommitError('Council reviews are not quorum-ready', 'not_quorum_ready');
    }

    const packet = buildShardQuorumPacket(working);
    const decision = buildShardQuorumDecision(packet, working);
    if (decision.status !== 'quorum_ready') {
      throw new ShardCommitError('Shard quorum decision is not ready', 'not_quorum_ready');
    }

    const entry = buildShardCandidateLedgerEntry(working);
    const { ledgerPosition } = await pushLedgerEntry(entry);

    const substrate = await writeToSubstrate({
      id: entry.id,
      agent: 'EVE',
      agentOrigin: 'EVE',
      cycle: working.cycleId,
      title: entry.title,
      summary: entry.body ?? entry.title,
      category: 'governance',
      severity: 'elevated',
      source: 'eve-shard-candidate',
      confidence: 0.85,
      derivedFrom: entry.derivedFromIds,
      tags: entry.tags,
      verified: true,
    });

    const now = new Date().toISOString();
    const updated: StoredShardProposal = {
      ...working,
      updatedAt: now,
      quorumPacketId: packet.packetId,
      ledgerCommitId: entry.id,
      document: {
        ...working.document,
        shard: {
          ...working.document.shard,
          status: 'approved_for_quorum',
        },
        pipeline_status: {
          ledger_status: 'candidate_committed',
          seal_status: 'pending_quorum',
        },
      },
    };

    return {
      proposal: updated,
      commit: {
        ledgerEntryId: entry.id,
        ledgerPosition: ledgerPosition ?? null,
        quorumPacketId: packet.packetId,
        substrate,
      },
    };
  } catch (error) {
    rollbackShardLedgerCommit(proposal.id);
    throw error;
  }
}
