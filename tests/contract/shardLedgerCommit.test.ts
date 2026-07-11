import assert from 'node:assert/strict';

import { buildShardCandidate } from '../../lib/epicon/shards/buildCandidate';
import { ShardCommitError } from '../../lib/epicon/shards/commit-candidate';
import {
  reserveShardLedgerCommit,
  rollbackShardLedgerCommit,
  updateShardReview,
} from '../../lib/epicon/shards/store';
import { toPublicShardProposal } from '../../lib/epicon/shards/sanitize';

async function main() {
  const proposal = buildShardCandidate({ cycleId: 'C-368' });

  let commitModule: typeof import('../../lib/epicon/shards/commit-candidate');
  try {
    commitModule = await import('../../lib/epicon/shards/commit-candidate');
    await commitModule.commitShardCandidate(proposal);
    assert.fail('expected commit to fail before quorum reviews');
  } catch (error) {
    assert.ok(error instanceof ShardCommitError);
    assert.equal(error.code, 'not_quorum_ready');
  }

  let current = proposal;
  for (const agent of ['atlas', 'zeus', 'aurea', 'jade'] as const) {
    const updated = updateShardReview(current.id, agent, 'pass');
    assert.ok(updated);
    current = updated;
  }

  const firstReservation = reserveShardLedgerCommit(current.id);
  assert.equal(firstReservation.ok, true);
  const secondReservation = reserveShardLedgerCommit(current.id);
  assert.equal(secondReservation.ok, false);
  if (!secondReservation.ok) {
    assert.equal(secondReservation.reason, 'already_committed');
  }
  rollbackShardLedgerCommit(current.id);
  const thirdReservation = reserveShardLedgerCommit(current.id);
  assert.equal(thirdReservation.ok, true);
  rollbackShardLedgerCommit(current.id);

  const payload = toPublicShardProposal(current);
  assert.equal(payload.sealed, false);
  assert.notEqual(payload.document.shard.status, 'sealed');
  assert.equal(payload.document.pipeline_status.seal_status, 'pending_quorum');

  console.log('✓ shard ledger commit guard checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
