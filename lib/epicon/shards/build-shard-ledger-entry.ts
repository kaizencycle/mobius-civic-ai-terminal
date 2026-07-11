import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import type { StoredShardProposal } from '@/lib/epicon/shards/store';

export function buildShardCandidateLedgerEntry(proposal: StoredShardProposal): EpiconLedgerFeedEntry {
  const { document } = proposal;
  const ledgerId = `SHARD-CANDIDATE-${proposal.id}`;

  return {
    id: ledgerId,
    timestamp: new Date().toISOString(),
    author: 'EVE',
    title: `Shard candidate ${proposal.id} (${proposal.cycleId})`,
    body: document.intent.final,
    type: 'epicon',
    severity: document.seal_recommendation.proposed_tier === 'EP-3' ? 'elevated' : 'medium',
    tags: [
      'eve-shard-candidate',
      proposal.cycleId,
      proposal.id,
      document.provenance.source_root_hash,
      document.seal_recommendation.recommendation,
    ],
    source: 'eve-shard-candidate',
    verified: true,
    verifiedBy: 'ZEUS',
    cycle: proposal.cycleId,
    category: 'governance',
    confidenceTier: document.seal_recommendation.proposed_tier === 'EP-1' ? 1 : 2,
    derivedFrom: proposal.id,
    derivedFromIds: [proposal.id, ...document.scope.epicon_ids],
    status: 'committed',
    agentOrigin: 'EVE',
  };
}
