import assert from 'node:assert/strict';

import { buildShardCandidate } from '../../lib/epicon/shards/buildCandidate';
import { buildShardCandidateLedgerEntry } from '../../lib/epicon/shards/build-shard-ledger-entry';
import {
  buildShardQuorumDecision,
  buildShardQuorumPacket,
} from '../../lib/epicon/shards/build-shard-quorum-packet';
import { evaluateShardQuorum, SHARD_QUORUM_AGENTS } from '../../lib/epicon/shards/quorum-gate';
import { updateShardReview } from '../../lib/epicon/shards/store';

async function main() {
  const proposal = buildShardCandidate({ cycleId: 'C-368' });

  let evaluation = evaluateShardQuorum(proposal);
  assert.equal(evaluation.ready, false);
  assert.equal(evaluation.missing.length, SHARD_QUORUM_AGENTS.length);

  let current = proposal;
  for (const agent of SHARD_QUORUM_AGENTS) {
    const updated = updateShardReview(current.id, agent, 'pass');
    assert.ok(updated);
    current = updated;
  }

  evaluation = evaluateShardQuorum(current);
  assert.equal(evaluation.ready, true);
  assert.equal(current.document.shard.status, 'approved_for_quorum');
  assert.equal(current.document.pipeline_status.seal_status, 'pending_quorum');
  assert.equal(current.document.pipeline_status.ledger_status, 'not_ingested');

  const packet = buildShardQuorumPacket(current);
  const decision = buildShardQuorumDecision(packet, current);
  assert.equal(decision.status, 'quorum_ready');
  assert.equal(decision.finalRecommendation, 'pass');

  const ledgerEntry = buildShardCandidateLedgerEntry(current);
  assert.equal(ledgerEntry.source, 'eve-shard-candidate');
  assert.equal(ledgerEntry.status, 'committed');
  assert.ok(ledgerEntry.derivedFromIds?.includes(current.id));

  console.log('✓ shard quorum gate contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
