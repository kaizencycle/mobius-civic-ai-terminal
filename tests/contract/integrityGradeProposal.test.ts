import assert from 'node:assert/strict';

import {
  IntegrityGradeRequestError,
  createIntegrityGradeRequest,
} from '../../lib/mfs/integrity-grade/create-request';
import { toPublicIntegrityGradeRequest } from '../../lib/mfs/integrity-grade/sanitize';
import {
  createIntegrityGradeRequestRecord,
  listIntegrityGradeRequests,
  updateIntegrityGradeReview,
} from '../../lib/mfs/integrity-grade/store';
import type { IntegrityGradeRequestDoc } from '../../lib/mfs/integrity-grade/types';
import { GRADE_REVIEW_AGENTS } from '../../lib/mfs/integrity-grade/types';

const VALID_HASH =
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function buildReviewWindowRequestDoc(requestId: string): IntegrityGradeRequestDoc {
  const now = new Date().toISOString();
  return {
    schema_version: '0.1',
    request_id: requestId,
    wallet_id: 'wallet-c369',
    portfolio_root_hash: VALID_HASH,
    consent: {
      granted: true,
      scope: 'portfolio_review',
      recorded_at: now,
    },
    requested_at: now,
    fountain_state: 'REVIEW_WINDOW_OPEN',
    status: 'PROPOSED',
  };
}

async function main() {
  try {
    await createIntegrityGradeRequest({
      wallet_id: 'wallet-test',
      portfolio_root_hash: 'invalid',
      consent_granted: true,
    });
    assert.fail('expected invalid_hash error');
  } catch (error) {
    assert.ok(error instanceof IntegrityGradeRequestError);
    assert.equal(error.code, 'invalid_hash');
  }

  try {
    await createIntegrityGradeRequest({
      wallet_id: 'wallet-test',
      portfolio_root_hash: VALID_HASH,
      consent_granted: false,
    });
    assert.fail('expected consent_required error');
  } catch (error) {
    assert.ok(error instanceof IntegrityGradeRequestError);
    assert.equal(error.code, 'consent_required');
  }

  const stored = createIntegrityGradeRequestRecord(buildReviewWindowRequestDoc('IGR-C369-TEST-001'));

  const payload = toPublicIntegrityGradeRequest(stored);
  assert.equal(payload.proposal_only, true);
  assert.equal(payload.minting_enabled, false);
  assert.ok(payload.result);
  assert.equal(payload.result!.recognition.mic, 0);
  assert.equal(payload.result!.recognition.status, 'none');
  assert.notEqual(payload.result!.status, 'RECOGNIZED');
  assert.equal(payload.request.schema_version, '0.1');
  assert.ok(payload.request.request_id.startsWith('IGR-C369-'));
  assert.ok(payload.request.epicon_id?.includes('integrity-grade-request'));

  for (const agent of GRADE_REVIEW_AGENTS) {
    updateIntegrityGradeReview(stored.id, agent, 'pass');
  }

  const afterReviews = listIntegrityGradeRequests().find((entry) => entry.id === stored.id);
  assert.ok(afterReviews?.result);
  assert.equal(afterReviews.result.recognition.mic, 0);
  assert.notEqual(afterReviews.result.status, 'RECOGNIZED');
  assert.ok(
    ['NEEDS_MORE_EVIDENCE', 'STEWARDSHIP_VERIFIED', 'RECOGNITION_PENDING', 'NOT_ELIGIBLE', 'CLARIFY', 'QUARANTINED'].includes(
      afterReviews.result.status,
    ),
  );

  const publicAfter = toPublicIntegrityGradeRequest(afterReviews);
  assert.equal(publicAfter.result?.recognition.mic, 0);
  assert.equal(publicAfter.minting_enabled, false);

  console.log('✓ integrity grade proposal contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
