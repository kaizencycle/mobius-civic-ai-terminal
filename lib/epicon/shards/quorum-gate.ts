import type { ReviewAgent, ReviewVerdict } from '@/lib/epicon/shards/compiler/types';
import type { StoredShardProposal } from '@/lib/epicon/shards/store';

export const SHARD_QUORUM_AGENTS: ReviewAgent[] = ['atlas', 'zeus', 'aurea', 'jade'];

export type ShardQuorumEvaluation = {
  ready: boolean;
  missing: ReviewAgent[];
  failed: ReviewAgent[];
  clarify: ReviewAgent[];
  blocking: string[];
};

export function evaluateShardQuorum(proposal: StoredShardProposal): ShardQuorumEvaluation {
  const missing: ReviewAgent[] = [];
  const failed: ReviewAgent[] = [];
  const clarify: ReviewAgent[] = [];

  for (const agent of SHARD_QUORUM_AGENTS) {
    const verdict = proposal.reviews[agent] as ReviewVerdict | undefined;
    if (!verdict || verdict === 'pending') {
      missing.push(agent);
      continue;
    }
    if (verdict === 'fail') {
      failed.push(agent);
      continue;
    }
    if (verdict === 'clarify') {
      clarify.push(agent);
    }
  }

  const blocking: string[] = [];
  if (proposal.document.shard.status === 'quarantined') {
    blocking.push('shard_quarantined');
  }
  if (failed.length > 0) {
    blocking.push(`failed_reviews:${failed.join(',')}`);
  }
  if (clarify.length > 0) {
    blocking.push(`clarify_reviews:${clarify.join(',')}`);
  }
  if (missing.length > 0) {
    blocking.push(`missing_reviews:${missing.join(',')}`);
  }

  return {
    ready: blocking.length === 0,
    missing,
    failed,
    clarify,
    blocking,
  };
}

export function isShardQuorumReady(proposal: StoredShardProposal): boolean {
  return evaluateShardQuorum(proposal).ready;
}

export function syncShardQuorumStatus(proposal: StoredShardProposal): StoredShardProposal {
  const evaluation = evaluateShardQuorum(proposal);

  if (!evaluation.ready) {
    return proposal;
  }

  if (proposal.document.pipeline_status.ledger_status !== 'not_ingested') {
    return proposal;
  }

  return {
    ...proposal,
    document: {
      ...proposal.document,
      shard: {
        ...proposal.document.shard,
        status: 'approved_for_quorum',
      },
      pipeline_status: {
        ...proposal.document.pipeline_status,
        seal_status: 'pending_quorum',
      },
    },
  };
}
