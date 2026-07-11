import type { FountainStateName } from '@/lib/mfs/types';

export type IntegrityGradeRequestStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'IN_REVIEW'
  | 'COMPLETED'
  | 'WITHDRAWN'
  | 'REJECTED';

export type IntegrityGradeResultStatus =
  | 'NOT_ELIGIBLE'
  | 'NEEDS_MORE_EVIDENCE'
  | 'CLARIFY'
  | 'QUARANTINED'
  | 'STEWARDSHIP_VERIFIED'
  | 'RECOGNITION_PENDING'
  | 'RECOGNIZED';

export type GradeReviewAgent = 'atlas' | 'zeus' | 'eve' | 'jade' | 'aurea' | 'human';

export type GradeReviewVerdict = 'pass' | 'clarify' | 'reject' | 'pending';

export type HumanReviewVerdict = 'approved' | 'pending' | 'rejected' | 'deferred';

export type IntegrityGradeRequestDoc = {
  schema_version: '0.1';
  request_id: string;
  wallet_id: string;
  portfolio_id?: string;
  portfolio_root_hash: string;
  consent: {
    granted: true;
    scope: 'portfolio_review';
    recorded_at: string;
  };
  requested_at: string;
  fountain_state: FountainStateName;
  status: IntegrityGradeRequestStatus;
  epicon_id?: string;
};

export type IntegrityGradeResultDoc = {
  schema_version: '0.1';
  result_id: string;
  request_id: string;
  status: IntegrityGradeResultStatus;
  grade: string | null;
  findings: {
    capability_diversity: string;
    demonstrated_application: string;
    provenance: string;
    farming_risk: string;
    time_continuity: string;
    reviewed?: string[];
    missing?: string[];
    inferred?: string[];
    uncertain?: string[];
    rationale?: string;
  };
  recognition: {
    mic: number;
    reserve_block_ref: string | null;
    seal_ref?: string | null;
    status?: 'none' | 'pending' | 'recognized' | 'quarantined' | 'clawback_annotated';
  };
  review: {
    atlas: GradeReviewVerdict;
    zeus: GradeReviewVerdict;
    eve: GradeReviewVerdict;
    jade: GradeReviewVerdict;
    aurea: GradeReviewVerdict;
    human: HumanReviewVerdict;
  };
  completed_at: string;
};

export type StoredIntegrityGradeRequest = {
  id: string;
  createdAt: string;
  updatedAt: string;
  document: IntegrityGradeRequestDoc;
  reviews: Partial<Record<GradeReviewAgent, GradeReviewVerdict>>;
  humanReview: HumanReviewVerdict;
  result: IntegrityGradeResultDoc | null;
  proposal_only: true;
};

export const GRADE_REVIEW_AGENTS: GradeReviewAgent[] = ['atlas', 'zeus', 'eve', 'jade', 'aurea'];

export const SHA256_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
