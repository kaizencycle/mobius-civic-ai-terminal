import type { EveReserveShard } from '@/lib/epicon/shards/compiler/types';
import type { StoredShardProposal } from '@/lib/epicon/shards/store';

export type PublicShardProposal = {
  ok: true;
  sealed: false;
  proposal: StoredShardProposal;
  document: EveReserveShard;
};

function enforceProposalDocument(document: EveReserveShard): EveReserveShard {
  if (document.shard.status === 'sealed') {
    document.shard.status = 'proposed';
  }

  if (document.pipeline_status.seal_status === 'sealed') {
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
