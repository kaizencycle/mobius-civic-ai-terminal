import type {
  GradeReviewAgent,
  GradeReviewVerdict,
  HumanReviewVerdict,
  IntegrityGradeRequestDoc,
  IntegrityGradeResultDoc,
  IntegrityGradeResultStatus,
  StoredIntegrityGradeRequest,
} from '@/lib/mfs/integrity-grade/types';
import { GRADE_REVIEW_AGENTS } from '@/lib/mfs/integrity-grade/types';

function verdictOrPending(
  reviews: Partial<Record<GradeReviewAgent, GradeReviewVerdict>>,
  agent: GradeReviewAgent,
): GradeReviewVerdict {
  return reviews[agent] ?? 'pending';
}

function sealSentinelPasses(reviews: Partial<Record<GradeReviewAgent, GradeReviewVerdict>>): number {
  return GRADE_REVIEW_AGENTS.filter((agent) => reviews[agent] === 'pass').length;
}

function deriveStatus(
  request: IntegrityGradeRequestDoc,
  reviews: Partial<Record<GradeReviewAgent, GradeReviewVerdict>>,
): IntegrityGradeResultStatus {
  if (request.fountain_state !== 'REVIEW_WINDOW_OPEN') {
    return 'NOT_ELIGIBLE';
  }

  const zeus = verdictOrPending(reviews, 'zeus');
  if (zeus === 'reject') return 'QUARANTINED';
  if (GRADE_REVIEW_AGENTS.some((agent) => reviews[agent] === 'reject')) {
    return 'CLARIFY';
  }

  const pending = GRADE_REVIEW_AGENTS.filter((agent) => !reviews[agent] || reviews[agent] === 'pending');
  if (pending.length > 0) {
    return 'NEEDS_MORE_EVIDENCE';
  }

  if (zeus !== 'pass') {
    return 'NEEDS_MORE_EVIDENCE';
  }

  const passCount = sealSentinelPasses(reviews);
  if (passCount >= 4) {
    return 'RECOGNITION_PENDING';
  }

  if (passCount >= 3) {
    return 'STEWARDSHIP_VERIFIED';
  }

  return 'NEEDS_MORE_EVIDENCE';
}

export function buildProposalGradeResult(
  stored: StoredIntegrityGradeRequest,
): IntegrityGradeResultDoc {
  const status = deriveStatus(stored.document, stored.reviews);
  const now = new Date().toISOString();
  const passCount = sealSentinelPasses(stored.reviews);

  const findings = {
    capability_diversity: passCount >= 3 ? 'adequate' : 'insufficient',
    demonstrated_application: 'not_evaluated_in_c369',
    provenance: stored.document.portfolio_root_hash ? 'snapshot_recorded' : 'missing',
    farming_risk: stored.reviews.zeus === 'pass' ? 'low' : stored.reviews.zeus === 'reject' ? 'high' : 'unknown',
    time_continuity: 'not_evaluated_in_c369',
    reviewed: [
      `portfolio_root_hash ${stored.document.portfolio_root_hash}`,
      `fountain_state ${stored.document.fountain_state}`,
      `sentinel_passes ${passCount}/5`,
    ],
    missing:
      status === 'NEEDS_MORE_EVIDENCE'
        ? ['demonstrated application evidence', 'human approval', 'full sentinel quorum']
        : [],
    inferred: ['portfolio snapshot frozen at request time'],
    uncertain: ['C-369 proposal-only path — no MIC recognition issued'],
    rationale:
      'C-369 proposal-only review. Recognition requires human approval and separate quorum path — not automatic mint.',
  };

  return {
    schema_version: '0.1',
    result_id: `IG-${stored.id}`,
    request_id: stored.document.request_id,
    status,
    grade: null,
    findings,
    recognition: {
      mic: 0,
      reserve_block_ref: null,
      seal_ref: null,
      status: 'none',
    },
    review: {
      atlas: verdictOrPending(stored.reviews, 'atlas'),
      zeus: verdictOrPending(stored.reviews, 'zeus'),
      eve: verdictOrPending(stored.reviews, 'eve'),
      jade: verdictOrPending(stored.reviews, 'jade'),
      aurea: verdictOrPending(stored.reviews, 'aurea'),
      human: stored.humanReview,
    },
    completed_at: now,
  };
}
