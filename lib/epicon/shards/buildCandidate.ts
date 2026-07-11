import { generateShard } from '@/lib/epicon/shards/compiler/generate';
import { discoverCycleBundle } from '@/lib/epicon/shards/discover';
import { allocateShardProposalId, saveShardProposal, type StoredShardProposal } from '@/lib/epicon/shards/store';
import type { CycleShardBundle } from '@/lib/epicon/shards/compiler/types';

export type BuildShardCandidateInput = {
  cycleId: string;
  bundle?: CycleShardBundle;
};

export function buildShardCandidate(input: BuildShardCandidateInput): StoredShardProposal {
  const bundle = input.bundle ?? discoverCycleBundle(input.cycleId);
  const document = generateShard({
    cycle: input.cycleId,
    bundle: bundle ?? undefined,
  });

  const now = new Date().toISOString();
  const id = allocateShardProposalId(input.cycleId);
  document.shard.id = id;

  const proposal: StoredShardProposal = {
    id,
    cycleId: document.shard.cycle,
    createdAt: now,
    updatedAt: now,
    document,
    reviews: {},
  };

  saveShardProposal(proposal);
  return proposal;
}
