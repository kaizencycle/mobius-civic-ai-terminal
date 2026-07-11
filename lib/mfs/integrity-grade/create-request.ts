import { loadIntegrityPerception } from '@/lib/mfs/assemble-perception';
import {
  allocateIntegrityGradeRequestId,
  createIntegrityGradeRequestRecord,
} from '@/lib/mfs/integrity-grade/store';
import type { IntegrityGradeRequestDoc, StoredIntegrityGradeRequest } from '@/lib/mfs/integrity-grade/types';
import { SHA256_HASH_PATTERN } from '@/lib/mfs/integrity-grade/types';

export class IntegrityGradeRequestError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'consent_required'
      | 'invalid_hash'
      | 'fountain_closed'
      | 'fountain_quarantined',
  ) {
    super(message);
    this.name = 'IntegrityGradeRequestError';
  }
}

export type CreateIntegrityGradeRequestInput = {
  wallet_id: string;
  portfolio_id?: string;
  portfolio_root_hash: string;
  consent_granted: boolean;
};

export async function createIntegrityGradeRequest(
  input: CreateIntegrityGradeRequestInput,
): Promise<StoredIntegrityGradeRequest> {
  if (!input.consent_granted) {
    throw new IntegrityGradeRequestError('Consent is required for portfolio review', 'consent_required');
  }

  if (!SHA256_HASH_PATTERN.test(input.portfolio_root_hash)) {
    throw new IntegrityGradeRequestError(
      'portfolio_root_hash must match sha256:[64 hex chars]',
      'invalid_hash',
    );
  }

  const perception = await loadIntegrityPerception();
  const fountainState = perception.fountain_state.state;

  if (fountainState === 'QUARANTINED') {
    throw new IntegrityGradeRequestError(
      'Fountain is quarantined — Integrity Grade requests are not accepted',
      'fountain_quarantined',
    );
  }

  if (fountainState === 'CLOSED' || fountainState === 'DORMANT') {
    throw new IntegrityGradeRequestError(
      `Fountain state ${fountainState} — review window is not open`,
      'fountain_closed',
    );
  }

  const now = new Date().toISOString();
  const requestId = allocateIntegrityGradeRequestId();

  const document: IntegrityGradeRequestDoc = {
    schema_version: '0.1',
    request_id: requestId,
    wallet_id: input.wallet_id,
    portfolio_id: input.portfolio_id,
    portfolio_root_hash: input.portfolio_root_hash,
    consent: {
      granted: true,
      scope: 'portfolio_review',
      recorded_at: now,
    },
    requested_at: now,
    fountain_state: fountainState,
    status: fountainState === 'REVIEW_WINDOW_OPEN' ? 'PROPOSED' : 'PROPOSED',
  };

  return createIntegrityGradeRequestRecord(document);
}
