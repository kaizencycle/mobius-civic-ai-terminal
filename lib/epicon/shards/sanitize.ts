import type { EveReserveShard } from '@/lib/epicon/shards/compiler/types';
import type { StoredShardProposal } from '@/lib/epicon/shards/store';

export type PublicShardProposal = {
  ok: true;
  sealed: false;
  proposal: StoredShardProposal;
  document: EveReserveShard;
};

const ALLOWED_SHARD_STATUSES = new Set<EveReserveShard['shard']['status']>([
  'proposed',
  'needs_evidence',
  'clarify',
  'quarantined',
  'rejected',
  'approved_for_quorum',
  'export_pending',
  'cold_canon_verified',
]);

const ALLOWED_SEAL_STATUSES = new Set<EveReserveShard['pipeline_status']['seal_status']>([
  'not_requested',
  'pending_quorum',
  'rejected',
]);

function enforceProposalDocument(document: EveReserveShard): EveReserveShard {
  if (document.shard.status === 'sealed' || !ALLOWED_SHARD_STATUSES.has(document.shard.status)) {
    document.shard.status = 'proposed';
  }

  if (
    document.pipeline_status.seal_status === 'sealed' ||
    !ALLOWED_SEAL_STATUSES.has(document.pipeline_status.seal_status)
  ) {
    document.pipeline_status.seal_status = 'not_requested';
  }

  document.seal_recommendation.human_review_required = true;
  return document;
}

export function toPublicShardProposal(proposal: StoredShardProposal): PublicShardProposal {
  const document = enforceProposalDocument(structuredClone(proposal.document));

  return {
    ok: true,
    sealed: false,
    proposal: {
      ...proposal,
      document,
    },
    document,
  };
}
