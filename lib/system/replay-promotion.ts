import { hashPayload } from '@/lib/agents/signatures';
import { kvGet, kvSet } from '@/lib/kv/store';
import { buildReplaySnapshotResponse, evaluateReplayQuorum } from '@/lib/system/replay-quorum';

export const REPLAY_PROMOTION_VERSION = 'C-294.phase9.v1' as const;

export type ReplayPromotionAuthorization = {
  version: typeof REPLAY_PROMOTION_VERSION;
  seal_id: string;
  replay_snapshot_hash: string;
  quorum_hash: string;
  operator_id: string;
  operator_approved_at: string;
  operator_reason: string;
  authorization_hash: string;
  status: 'operator_authorized';
  mutation_allowed: false;
  readonly: true;
  canon: string[];
};

export type ReplayMutationPlan = {
  version: typeof REPLAY_PROMOTION_VERSION;
  seal_id: string;
  replay_snapshot_hash: string;
  quorum_hash: string;
  authorization_hash: string;
  mutation_kind: 'canon_overlay_only';
  proposed_effect: 'record_replay_promoted_overlay';
  original_history_preserved: true;
  vault_status_mutation: false;
  canonical_chain_mutation: false;
  mic_or_fountain_mutation: false;
  rollback_mutation: false;
  preconditions: string[];
  plan_hash: string;
  readonly: true;
};

export type ReplayMutationReceipt = ReplayMutationPlan & {
  status: 'recorded_overlay_only';
  executed_at: string;
  executor: 'operator_gate';
  receipt_hash: string;
  canon: string[];
};

export type ReplayPromotionSubmission = {
  seal_id: string;
  replay_snapshot_hash: string;
  quorum_hash: string;
  operator_id: string;
  operator_reason: string;
};

export type ReplayMutationSubmission = {
  seal_id: string;
  authorization_hash: string;
  operator_id: string;
  operator_reason: string;
};

export type ReplayPromotionResponse = {
  ok: true;
  readonly: true;
  promotion: ReplayPromotionAuthorization;
};

export type ReplayMutationPlanResponse = {
  ok: true;
  readonly: true;
  plan: ReplayMutationPlan;
};

export type ReplayMutationReceiptResponse = {
  ok: true;
  readonly: true;
  receipt: ReplayMutationReceipt;
};

export type ReplayPromotionError = {
  ok: false;
  readonly: true;
  error:
    | 'missing_body'
    | 'missing_seal_id'
    | 'seal_not_found'
    | 'snapshot_hash_mismatch'
    | 'quorum_not_approved'
    | 'quorum_hash_mismatch'
    | 'missing_operator_id'
    | 'missing_operator_reason'
    | 'authorization_missing'
    | 'authorization_hash_mismatch'
    | 'write_failed';
};

function promotionKey(sealId: string): string {
  return `system:replay:promotion:${sealId}`;
}

function mutationReceiptKey(sealId: string): string {
  return `system:replay:mutation:${sealId}`;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildPromotionAuthorization(args: ReplayPromotionSubmission): ReplayPromotionAuthorization {
  const operator_approved_at = new Date().toISOString();
  const authorization_hash = hashPayload({
    version: REPLAY_PROMOTION_VERSION,
    seal_id: args.seal_id,
    replay_snapshot_hash: args.replay_snapshot_hash,
    quorum_hash: args.quorum_hash,
    operator_id: args.operator_id,
    operator_reason: args.operator_reason,
    operator_approved_at,
  });

  return {
    version: REPLAY_PROMOTION_VERSION,
    seal_id: args.seal_id,
    replay_snapshot_hash: args.replay_snapshot_hash,
    quorum_hash: args.quorum_hash,
    operator_id: args.operator_id,
    operator_approved_at,
    operator_reason: args.operator_reason,
    authorization_hash,
    status: 'operator_authorized',
    mutation_allowed: false,
    readonly: true,
    canon: [
      'Phase 7 creates an operator authorization artifact only.',
      'This record does not mutate Vault, Canon, Ledger, MIC, Fountain, or rollback state.',
      'Original seal history remains preserved; replay does not rewrite original seal time.',
      'A later phase must re-check snapshot hash and quorum hash before any mutation is considered.',
    ],
  };
}

function buildMutationPlan(promotion: ReplayPromotionAuthorization): ReplayMutationPlan {
  const base = {
    version: REPLAY_PROMOTION_VERSION,
    seal_id: promotion.seal_id,
    replay_snapshot_hash: promotion.replay_snapshot_hash,
    quorum_hash: promotion.quorum_hash,
    authorization_hash: promotion.authorization_hash,
    mutation_kind: 'canon_overlay_only' as const,
    proposed_effect: 'record_replay_promoted_overlay' as const,
    original_history_preserved: true as const,
    vault_status_mutation: false as const,
    canonical_chain_mutation: false as const,
    mic_or_fountain_mutation: false as const,
    rollback_mutation: false as const,
    preconditions: [
      'Operator authorization exists and matches request authorization_hash.',
      'Replay snapshot hash still matches stored seal data.',
      'Replay quorum hash still matches approved Council Bus state.',
      'Original seal body remains unchanged.',
      'Canon exposes overlay/receipt as annotation only.',
    ],
    readonly: true as const,
  };
  return {
    ...base,
    plan_hash: hashPayload(base),
  };
}

function buildMutationReceipt(plan: ReplayMutationPlan): ReplayMutationReceipt {
  const executed_at = new Date().toISOString();
  const receiptBase = {
    ...plan,
    status: 'recorded_overlay_only' as const,
    executed_at,
    executor: 'operator_gate' as const,
  };
  return {
    ...receiptBase,
    receipt_hash: hashPayload(receiptBase),
    canon: [
      'Phase 9 records a controlled mutation receipt as an overlay only.',
      'The original seal remains unchanged and inspectable.',
      'No Vault status, canonical chain, MIC, Fountain, Ledger, or rollback mutation occurred.',
      'Future phases may consume this receipt, but must re-check the hashes before any state transition.',
    ],
  };
}

export async function readReplayPromotion(sealId: string | null): Promise<ReplayPromotionResponse | ReplayPromotionError> {
  if (!sealId) return { ok: false, error: 'missing_seal_id', readonly: true };
  const stored = await kvGet<ReplayPromotionAuthorization>(promotionKey(sealId));
  if (!stored) return { ok: false, error: 'seal_not_found', readonly: true };
  return { ok: true, readonly: true, promotion: stored };
}

export async function readReplayMutationReceipt(sealId: string | null): Promise<ReplayMutationReceiptResponse | ReplayPromotionError> {
  if (!sealId) return { ok: false, error: 'missing_seal_id', readonly: true };
  const stored = await kvGet<ReplayMutationReceipt>(mutationReceiptKey(sealId));
  if (!stored) return { ok: false, error: 'seal_not_found', readonly: true };
  return { ok: true, readonly: true, receipt: stored };
}

export async function previewReplayMutationPlan(sealId: string | null): Promise<ReplayMutationPlanResponse | ReplayPromotionError> {
  const promotionResult = await readReplayPromotion(sealId);
  if (!promotionResult.ok) return promotionResult;
  return { ok: true, readonly: true, plan: buildMutationPlan(promotionResult.promotion) };
}

export async function authorizeReplayPromotion(body: unknown): Promise<ReplayPromotionResponse | ReplayPromotionError> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'missing_body', readonly: true };
  const candidate = body as Partial<ReplayPromotionSubmission>;
  if (!hasNonEmptyString(candidate.seal_id)) return { ok: false, error: 'missing_seal_id', readonly: true };
  if (!hasNonEmptyString(candidate.operator_id)) return { ok: false, error: 'missing_operator_id', readonly: true };
  if (!hasNonEmptyString(candidate.operator_reason)) return { ok: false, error: 'missing_operator_reason', readonly: true };

  const snapshot = await buildReplaySnapshotResponse(candidate.seal_id);
  if (!snapshot.ok) return snapshot.error === 'seal_not_found'
    ? { ok: false, error: 'seal_not_found', readonly: true }
    : { ok: false, error: 'missing_seal_id', readonly: true };
  if (candidate.replay_snapshot_hash !== snapshot.snapshot.replay_snapshot_hash) {
    return { ok: false, error: 'snapshot_hash_mismatch', readonly: true };
  }

  const quorum = await evaluateReplayQuorum(candidate.seal_id);
  if (!quorum.ok) return quorum.error === 'seal_not_found'
    ? { ok: false, error: 'seal_not_found', readonly: true }
    : { ok: false, error: 'missing_seal_id', readonly: true };
  if (!quorum.evaluation.back_attestation_candidate || !quorum.evaluation.quorum_hash) {
    return { ok: false, error: 'quorum_not_approved', readonly: true };
  }
  if (candidate.quorum_hash !== quorum.evaluation.quorum_hash) {
    return { ok: false, error: 'quorum_hash_mismatch', readonly: true };
  }

  const promotion = buildPromotionAuthorization({
    seal_id: candidate.seal_id,
    replay_snapshot_hash: candidate.replay_snapshot_hash,
    quorum_hash: candidate.quorum_hash,
    operator_id: candidate.operator_id,
    operator_reason: candidate.operator_reason,
  });
  const wrote = await kvSet(promotionKey(candidate.seal_id), promotion);
  if (!wrote) return { ok: false, error: 'write_failed', readonly: true };
  return { ok: true, readonly: true, promotion };
}

export async function recordReplayMutationReceipt(body: unknown): Promise<ReplayMutationReceiptResponse | ReplayPromotionError> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'missing_body', readonly: true };
  const candidate = body as Partial<ReplayMutationSubmission>;
  if (!hasNonEmptyString(candidate.seal_id)) return { ok: false, error: 'missing_seal_id', readonly: true };
  if (!hasNonEmptyString(candidate.operator_id)) return { ok: false, error: 'missing_operator_id', readonly: true };
  if (!hasNonEmptyString(candidate.operator_reason)) return { ok: false, error: 'missing_operator_reason', readonly: true };
  if (!hasNonEmptyString(candidate.authorization_hash)) return { ok: false, error: 'authorization_missing', readonly: true };

  const promotionResult = await readReplayPromotion(candidate.seal_id);
  if (!promotionResult.ok) return { ok: false, error: 'authorization_missing', readonly: true };
  if (candidate.authorization_hash !== promotionResult.promotion.authorization_hash) {
    return { ok: false, error: 'authorization_hash_mismatch', readonly: true };
  }

  const snapshot = await buildReplaySnapshotResponse(candidate.seal_id);
  if (!snapshot.ok) return snapshot.error === 'seal_not_found'
    ? { ok: false, error: 'seal_not_found', readonly: true }
    : { ok: false, error: 'missing_seal_id', readonly: true };
  if (snapshot.snapshot.replay_snapshot_hash !== promotionResult.promotion.replay_snapshot_hash) {
    return { ok: false, error: 'snapshot_hash_mismatch', readonly: true };
  }

  const quorum = await evaluateReplayQuorum(candidate.seal_id);
  if (!quorum.ok) return quorum.error === 'seal_not_found'
    ? { ok: false, error: 'seal_not_found', readonly: true }
    : { ok: false, error: 'missing_seal_id', readonly: true };
  if (!quorum.evaluation.back_attestation_candidate || !quorum.evaluation.quorum_hash) {
    return { ok: false, error: 'quorum_not_approved', readonly: true };
  }
  if (quorum.evaluation.quorum_hash !== promotionResult.promotion.quorum_hash) {
    return { ok: false, error: 'quorum_hash_mismatch', readonly: true };
  }

  const receipt = buildMutationReceipt(buildMutationPlan(promotionResult.promotion));
  const wrote = await kvSet(mutationReceiptKey(candidate.seal_id), receipt);
  if (!wrote) return { ok: false, error: 'write_failed', readonly: true };
  return { ok: true, readonly: true, receipt };
}
