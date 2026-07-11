import type { StoredIntegrityGradeRequest } from '@/lib/mfs/integrity-grade/types';

export function toPublicIntegrityGradeRequest(stored: StoredIntegrityGradeRequest) {
  return {
    ok: true,
    proposal_only: true as const,
    minting_enabled: false as const,
    request: stored.document,
    reviews: stored.reviews,
    human_review: stored.humanReview,
    result: stored.result,
    created_at: stored.createdAt,
    updated_at: stored.updatedAt,
  };
}
