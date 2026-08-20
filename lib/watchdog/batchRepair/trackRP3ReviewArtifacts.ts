import type { TrackRP3ReviewContext } from '@/lib/watchdog/batchRepair/trackRP3GovernanceIntake';

export const TRACK_R_P3_GOVERNANCE_SCOPE = 'Track R P3 packet governance' as const;

export type TrackRP3ReviewLane = 'ZEUS' | 'EVE';

export type TrackRP3ReviewReceiptStatus = 'AWAITING_INDEPENDENT_REVIEW';

export function trackRP3ReviewArtifactPath(args: {
  workflowRunId: string;
  lane: TrackRP3ReviewLane;
}): string {
  return `docs/epicon/cycles/C-408/track-r-p3-review/${args.workflowRunId}/${args.lane}_P3_PACKET_REVIEW.md`;
}

export function renderTrackRP3MachineVerificationReceipt(args: {
  lane: TrackRP3ReviewLane;
  context: TrackRP3ReviewContext;
  generatedAt: string;
  intakeStatus: TrackRP3ReviewReceiptStatus;
}): string {
  const { context, lane, generatedAt, intakeStatus } = args;
  return [
    `# Track R P3 Packet Review — ${lane}`,
    '',
    '> **MACHINE VERIFICATION RECEIPT — NOT INDEPENDENT MODEL REVIEW**',
    '> Deterministic intake checks passed. This artifact does **not** authorize execution.',
    '',
    '## Identity binding',
    '',
    `- workflow_run_id: \`${context.workflow_run_id}\``,
    `- packet_hash: \`${context.packet_hash}\``,
    `- journal_id: \`${context.journal_id}\``,
    `- observed_production_commit: \`${context.observed_production_commit}\``,
    '',
    '## Authority posture',
    '',
    '- execution_authorized: false',
    '- production_mutation_performed: false',
    '- review_does_not_authorize_execution: true',
    '',
    '## Review status',
    '',
    `- review_lane: ${lane}`,
    `- review_status: ${intakeStatus}`,
    `- generated_at: ${generatedAt}`,
    '',
    lane === 'ZEUS'
      ? '## ZEUS scope (pending independent review)\n\nAdversarial hash/provenance verification, production commit binding, CAS freshness, affected-block set, four-write scope, 131 cutoff, idempotency, and rollback challenges remain for independent ZEUS review.'
      : '## EVE scope (pending independent review)\n\nConstitutional authority boundaries, human-control preservation, historical evidence preservation, quarantine semantics, and ratified-scope checks remain for independent EVE review.',
    '',
    '## Stop line',
    '',
    'Packet discovered != packet reviewed. Packet reviewed != human approved. Human approved != one-shot handoff signed.',
  ].join('\n');
}

export function isTrackRP3GovernanceJournalEntry(entry: {
  scope?: string;
  category?: string;
  derivedFrom?: string[];
}): boolean {
  if (entry.scope !== TRACK_R_P3_GOVERNANCE_SCOPE) return false;
  if (entry.category !== 'governance-review') return false;
  const tags = entry.derivedFrom ?? [];
  return tags.some((tag) => tag.startsWith('workflow_run_id:')) && tags.some((tag) => tag.startsWith('packet_hash:'));
}

export function satisfiesTrackRP3PacketReview(entry: {
  scope?: string;
  category?: string;
  derivedFrom?: string[];
}): boolean {
  return isTrackRP3GovernanceJournalEntry(entry);
}

export type TrackRIndependentReviewVerdict = 'ADOPT' | 'CHALLENGE' | 'OVERTURN';

export type TrackRIndependentReviewRecord = {
  reviewer: TrackRP3ReviewLane;
  workflow_run_id: string;
  packet_hash: string;
  journal_id: string;
  production_commit: string;
  capture_id: string;
  verdict: TrackRIndependentReviewVerdict;
  reviewed_at: string;
  evidence_refs: string[];
};

const TERMINAL_REVIEW_VERDICTS = new Set<string>(['adopt', 'challenge', 'overturn']);

export function validateTrackRIndependentReviewRecord(
  record: Partial<TrackRIndependentReviewRecord>,
  expected: {
    workflow_run_id: string;
    packet_hash: string;
    journal_id: string;
    production_commit: string;
  },
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!record.reviewer || (record.reviewer !== 'ZEUS' && record.reviewer !== 'EVE')) {
    errors.push('reviewer_identity_required');
  }
  if (record.workflow_run_id !== expected.workflow_run_id) {
    errors.push('workflow_run_id_binding_failed');
  }
  if (record.packet_hash !== expected.packet_hash) {
    errors.push('packet_hash_binding_failed');
  }
  if (record.journal_id !== expected.journal_id) {
    errors.push('journal_id_binding_failed');
  }
  if (record.production_commit !== expected.production_commit) {
    errors.push('production_commit_binding_failed');
  }
  if (!record.verdict || !TERMINAL_REVIEW_VERDICTS.has(record.verdict.toLowerCase())) {
    errors.push('verdict_must_be_adopt_challenge_or_overturn');
  }
  if (!record.reviewed_at) {
    errors.push('review_timestamp_required');
  }
  if (!record.capture_id) {
    errors.push('capture_id_required');
  }
  if (!Array.isArray(record.evidence_refs) || record.evidence_refs.length === 0) {
    errors.push('independent_evidence_refs_required');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function intakeStateIsNotVerdict(state: string): boolean {
  const intakeStates = new Set([
    'NOT_SEEN',
    'INTAKE_VERIFIED',
    'AWAITING_INDEPENDENT_REVIEW',
    'REVIEW_IN_PROGRESS',
    'BLOCKED',
    'SUPERSEDED',
    'intake_verified',
    'awaiting_zeus',
    'awaiting_eve',
  ]);
  return intakeStates.has(state);
}
