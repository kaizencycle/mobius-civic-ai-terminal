import { createHash } from 'node:crypto';

import type { ReviewAgent, ReviewVerdict } from '@/lib/epicon/shards/compiler/types';
import type { StoredShardProposal } from '@/lib/epicon/shards/store';

import { evaluateShardQuorum } from './quorum-gate';

export type ShardQuorumPacket = {
  packetId: string;
  shardId: string;
  cycleId: string;
  sourceRootHash: string;
  epiconIds: string[];
  reviews: Partial<Record<ReviewAgent, ReviewVerdict>>;
  createdAt: string;
  enforcement: 'disabled';
};

export type ShardQuorumDecision = {
  packetId: string;
  status: 'not_ready' | 'quorum_ready' | 'blocked';
  blocking: string[];
  finalRecommendation: 'pass' | 'clarify' | 'quarantine' | 'hold';
  enforcement: 'disabled';
  decidedAt: string;
};

export function buildShardQuorumPacket(proposal: StoredShardProposal): ShardQuorumPacket {
  const packetId = createHash('sha256')
    .update(
      JSON.stringify({
        cycleId: proposal.cycleId,
        reviews: proposal.reviews,
        shardId: proposal.id,
        sourceRootHash: proposal.document.provenance.source_root_hash,
      }),
    )
    .digest('hex');

  return {
    packetId,
    shardId: proposal.id,
    cycleId: proposal.cycleId,
    sourceRootHash: proposal.document.provenance.source_root_hash,
    epiconIds: [...proposal.document.scope.epicon_ids],
    reviews: { ...proposal.reviews },
    createdAt: new Date().toISOString(),
    enforcement: 'disabled',
  };
}

export function buildShardQuorumDecision(
  packet: ShardQuorumPacket,
  proposal: StoredShardProposal,
): ShardQuorumDecision {
  const evaluation = evaluateShardQuorum(proposal);

  if (evaluation.failed.length > 0 || proposal.document.shard.status === 'quarantined') {
    return {
      packetId: packet.packetId,
      status: 'blocked',
      blocking: evaluation.blocking,
      finalRecommendation: 'quarantine',
      enforcement: 'disabled',
      decidedAt: new Date().toISOString(),
    };
  }

  if (!evaluation.ready) {
    return {
      packetId: packet.packetId,
      status: 'not_ready',
      blocking: evaluation.blocking,
      finalRecommendation: evaluation.clarify.length > 0 ? 'clarify' : 'hold',
      enforcement: 'disabled',
      decidedAt: new Date().toISOString(),
    };
  }

  return {
    packetId: packet.packetId,
    status: 'quorum_ready',
    blocking: [],
    finalRecommendation: 'pass',
    enforcement: 'disabled',
    decidedAt: new Date().toISOString(),
  };
}
