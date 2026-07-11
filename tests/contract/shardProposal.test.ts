import assert from 'node:assert/strict';

import { buildShardCandidate } from '../../lib/epicon/shards/buildCandidate';
import { toPublicShardProposal } from '../../lib/epicon/shards/sanitize';
import { listShardProposals } from '../../lib/epicon/shards/store';

async function main() {
  const proposal = buildShardCandidate({ cycleId: 'C-368' });
  const payload = toPublicShardProposal(proposal);

  assert.equal(payload.sealed, false);
  assert.notEqual(payload.document.shard.status, 'sealed');
  assert.equal(payload.document.pipeline_status.seal_status, 'not_requested');
  assert.equal(payload.document.seal_recommendation.human_review_required, true);
  assert.ok(payload.document.provenance.source_root_hash.startsWith('sha256:'));
  assert.ok(payload.document.uncertainties.length >= 1);

  const second = buildShardCandidate({ cycleId: 'C-368' });
  assert.notEqual(second.id, proposal.id);
  assert.equal(second.document.shard.id, second.id);
  assert.equal(
    second.document.provenance.source_root_hash,
    proposal.document.provenance.source_root_hash,
  );

  const forCycle = listShardProposals().filter((entry) => entry.cycleId === 'C-368');
  assert.ok(forCycle.length >= 2, 'repeated proposals must not overwrite prior cycle entries');

  console.log('✓ shard proposal API contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
