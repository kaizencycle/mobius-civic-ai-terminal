import { buildProposalGradeResult } from '@/lib/mfs/integrity-grade/build-result';
import type {
  GradeReviewAgent,
  GradeReviewVerdict,
  HumanReviewVerdict,
  IntegrityGradeRequestDoc,
  StoredIntegrityGradeRequest,
} from '@/lib/mfs/integrity-grade/types';

const requests = new Map<string, StoredIntegrityGradeRequest>();
let seq = 0;

export function allocateIntegrityGradeRequestId(): string {
  seq += 1;
  return `IGR-C369-${String(seq).padStart(3, '0')}`;
}

export function saveIntegrityGradeRequest(stored: StoredIntegrityGradeRequest): void {
  requests.set(stored.id, stored);
}

export function getIntegrityGradeRequest(id: string): StoredIntegrityGradeRequest | null {
  return requests.get(id) ?? null;
}

export function listIntegrityGradeRequests(): StoredIntegrityGradeRequest[] {
  return [...requests.values()];
}

export function createIntegrityGradeRequestRecord(
  document: IntegrityGradeRequestDoc,
): StoredIntegrityGradeRequest {
  const now = new Date().toISOString();
  const stored: StoredIntegrityGradeRequest = {
    id: document.request_id,
    createdAt: now,
    updatedAt: now,
    document: {
      ...document,
      epicon_id: document.epicon_id ?? `EPICON_C-369_CORE_integrity-grade-request_${document.request_id}`,
    },
    reviews: {},
    humanReview: 'pending',
    result: null,
    proposal_only: true,
  };
  stored.result = buildProposalGradeResult(stored);
  requests.set(stored.id, stored);
  return stored;
}

export function updateIntegrityGradeReview(
  id: string,
  agent: GradeReviewAgent,
  verdict: GradeReviewVerdict,
): StoredIntegrityGradeRequest | null {
  const existing = requests.get(id);
  if (!existing) return null;

  const updated: StoredIntegrityGradeRequest = {
    ...existing,
    updatedAt: new Date().toISOString(),
    document: {
      ...existing.document,
      status: 'IN_REVIEW',
    },
    reviews: {
      ...existing.reviews,
      [agent]: verdict,
    },
  };

  updated.result = buildProposalGradeResult(updated);
  requests.set(id, updated);
  return updated;
}

export function setIntegrityGradeHumanReview(
  id: string,
  verdict: HumanReviewVerdict,
): StoredIntegrityGradeRequest | null {
  const existing = requests.get(id);
  if (!existing) return null;

  const updated: StoredIntegrityGradeRequest = {
    ...existing,
    updatedAt: new Date().toISOString(),
    humanReview: verdict,
    document: {
      ...existing.document,
      status: verdict === 'approved' ? 'COMPLETED' : existing.document.status,
    },
  };

  updated.result = buildProposalGradeResult(updated);
  requests.set(id, updated);
  return updated;
}
