/**
 * C-406 — separate receipt quorum from seal completion and execution authority.
 */

import type { SentinelQuorumState } from '@/lib/mic/quorumTracker';

export type QuorumReceiptStatus = 'pending' | 'in_progress' | 'received';
export type SealEligibilityStatus = 'none' | 'receipt_only' | 'blocked';
export type SealStatusLabel = 'not_eligible' | 'receipt_quorum_only' | 'eligible_pending_gates';
export type AdjudicationStatus = 'none' | 'pending' | 'in_progress' | 'complete';
export type VerificationStatusLabel = 'unknown' | 'verified' | 'disputed' | 'blocked';

export type QuorumAuthoritySemantics = {
  quorum_receipt_status: QuorumReceiptStatus;
  attestations_received: number;
  attestations_needed: number;
  attestation_agreement: null;
  verification_status: VerificationStatusLabel;
  adjudication_status: AdjudicationStatus;
  candidates_reviewed: number;
  seal_eligibility: SealEligibilityStatus;
  seal_status: SealStatusLabel;
  execution_authorized: false;
  receipt_note: string;
};

export function deriveQuorumAuthoritySemantics(
  state: SentinelQuorumState,
  opts?: {
    verification_status?: VerificationStatusLabel;
    candidates_reviewed?: number;
    tripwire_active?: boolean;
  },
): QuorumAuthoritySemantics {
  const verification_status = opts?.verification_status ?? 'unknown';
  const candidates_reviewed = opts?.candidates_reviewed ?? 0;
  const tripwire_active = opts?.tripwire_active ?? false;

  const quorum_receipt_status: QuorumReceiptStatus =
    state.status === 'achieved'
      ? 'received'
      : state.status === 'in_progress'
        ? 'in_progress'
        : 'pending';

  const receiptComplete = state.attestations_received >= state.attestations_needed;

  let seal_eligibility: SealEligibilityStatus = 'none';
  if (receiptComplete) {
    seal_eligibility =
      verification_status === 'disputed' || tripwire_active || candidates_reviewed === 0
        ? 'blocked'
        : 'receipt_only';
  }

  const seal_status: SealStatusLabel = receiptComplete
    ? seal_eligibility === 'blocked'
      ? 'receipt_quorum_only'
      : 'eligible_pending_gates'
    : 'not_eligible';

  const receipt_note = receiptComplete
    ? verification_status === 'disputed' || candidates_reviewed === 0 || tripwire_active
      ? `${state.attestations_received}/${state.attestations_needed} attestations received — receipt quorum only; not seal completion or execution authority`
      : `${state.attestations_received}/${state.attestations_needed} attestations received — receipt quorum met; independent verification and adjudication gates still required`
    : `${state.attestations_received}/${state.attestations_needed} attestations received — receipt quorum incomplete`;

  return {
    quorum_receipt_status,
    attestations_received: state.attestations_received,
    attestations_needed: state.attestations_needed,
    attestation_agreement: null,
    verification_status,
    adjudication_status: candidates_reviewed > 0 ? 'in_progress' : 'none',
    candidates_reviewed,
    seal_eligibility,
    seal_status,
    execution_authorized: false,
    receipt_note,
  };
}
