import { hashPayload } from '@/lib/agents/signatures';
import { kvGet, kvSet } from '@/lib/kv/store';
import { getSeal } from '@/lib/vault-v2/store';
import type { Seal, SentinelAgent } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';

export const REPLAY_QUORUM_VERSION = 'C-294.phase6.v1' as const;
export const REPLAY_QUORUM_THRESHOLD = 3 as const;

export type ReplaySnapshot = {
  version: typeof REPLAY_QUORUM_VERSION;
  seal_id: string;
  seal_hash: string;
  previous_seal_hash: string | null;
  deposit_hashes: string[];
  deposit_hashes_count: number;
  cycle_at_seal: string;
  sealed_at: string;
  gi_at_seal: number;
  mode_at_seal: Seal['mode_at_seal'];
  source_entries: number;
  status_at_replay: Seal['status'];
  fountain_status_at_replay: Seal['fountain_status'];
  substrate_pointer: {
    attestation_id: string | null;
    event_hash: string | null;
    attested_at: string | null;
    error: string | null;
  };
  replay_snapshot_hash: string;
  readonly: true;
  canon: string[];
};

export type ReplayCouncilVerdict = 'pass' | 'flag' | 'abstain';

export type ReplayCouncilMessage = {
  version: typeof REPLAY_QUORUM_VERSION;
  from_agent: SentinelAgent;
  seal_id: string;
  replay_snapshot_hash: string;
  verdict: ReplayCouncilVerdict;
  reason: string;
  signed_at: string;
  signature: string;
  signature_hash: string;
  readonly: true;
};

export type ReplayCouncilRecord = {
  version: typeof REPLAY_QUORUM_VERSION;
  seal_id: string;
  replay_snapshot_hash: string;
  created_at: string;
  updated_at: string;
  readonly: true;
  messages: Partial<Record<SentinelAgent, ReplayCouncilMessage>>;
  message_count: number;
  agents_present: SentinelAgent[];
  missing_agents: SentinelAgent[];
  canon: string[];
};

export type ReplayQuorumStatus = 'pending' | 'approved' | 'blocked' | 'contested';
export type ReplayCandidateState = 'not_ready' | 'candidate' | 'blocked';

export type ReplayQuorumEvaluation = {
  version: typeof REPLAY_QUORUM_VERSION;
  seal_id: string;
  replay_snapshot_hash: string;
  quorum_threshold: typeof REPLAY_QUORUM_THRESHOLD;
  required_agents: readonly SentinelAgent[];
  approved_count: number;
  flagged_count: number;
  abstained_count: number;
  message_count: number;
  missing_agents: SentinelAgent[];
  agents_present: SentinelAgent[];
  quorum_reached: boolean;
  quorum_hash: string | null;
  status: ReplayQuorumStatus;
  back_attestation_candidate: boolean;
  candidate_state: ReplayCandidateState;
  candidate_reason: string;
  operator_action_required: boolean;
  promotion_preconditions: string[];
  readonly: true;
  canon: string[];
};

export type ReplaySnapshotResponse = {
  ok: true;
  readonly: true;
  snapshot: ReplaySnapshot;
  council_contract: {
    required_agents: readonly SentinelAgent[];
    message_shape: Omit<ReplayCouncilMessage, 'signature' | 'signature_hash' | 'signed_at'> & {
      signed_at: 'ISO-8601';
      signature: 'agent signature over replay_snapshot_hash';
      signature_hash: 'sha256({agent, signature})';
    };
  };
};

export type ReplaySnapshotError = {
  ok: false;
  error: 'missing_seal_id' | 'seal_not_found';
  readonly: true;
};

export type ReplayCouncilSubmission = {
  from_agent: SentinelAgent;
  seal_id: string;
  replay_snapshot_hash: string;
  verdict: ReplayCouncilVerdict;
  reason: string;
  signed_at: string;
  signature: string;
};

export type ReplayCouncilResponse = {
  ok: true;
  readonly: true;
  record: ReplayCouncilRecord;
};

export type ReplayQuorumResponse = {
  ok: true;
  readonly: true;
  evaluation: ReplayQuorumEvaluation;
};

export type ReplayCouncilError = {
  ok: false;
  error:
    | 'missing_seal_id'
    | 'seal_not_found'
    | 'missing_body'
    | 'invalid_agent'
    | 'invalid_verdict'
    | 'invalid_signed_at'
    | 'missing_signature'
    | 'invalid_signature_scope'
    | 'snapshot_hash_mismatch'
    | 'write_failed';
  readonly: true;
};

function replayCouncilKey(sealId: string): string {
  return `system:replay:council:${sealId}`;
}

function replayHashInput(seal: Seal) {
  return {
    seal_id: seal.seal_id,
    seal_hash: seal.seal_hash,
    previous_seal_hash: seal.prev_seal_hash,
    deposit_hashes: seal.deposit_hashes,
    cycle_at_seal: seal.cycle_at_seal,
    sealed_at: seal.sealed_at,
    gi_at_seal: seal.gi_at_seal,
    mode_at_seal: seal.mode_at_seal,
    source_entries: seal.source_entries,
  };
}

function isSentinelAgent(value: string): value is SentinelAgent {
  return (SENTINEL_AGENTS as readonly string[]).includes(value);
}

function isReplayCouncilVerdict(value: string): value is ReplayCouncilVerdict {
  return value === 'pass' || value === 'flag' || value === 'abstain';
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDateString(value: unknown): value is string {
  if (!hasNonEmptyString(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function signatureReferencesSnapshot(signature: string, replaySnapshotHash: string): boolean {
  return signature.includes(replaySnapshotHash);
}

function normalizeCouncilRecord(record: ReplayCouncilRecord): ReplayCouncilRecord {
  const agentsPresent = SENTINEL_AGENTS.filter((agent) => Boolean(record.messages[agent]));
  return {
    ...record,
    message_count: agentsPresent.length,
    agents_present: agentsPresent,
    missing_agents: SENTINEL_AGENTS.filter((agent) => !record.messages[agent]),
  };
}

function emptyCouncilRecord(sealId: string, replaySnapshotHash: string): ReplayCouncilRecord {
  const now = new Date().toISOString();
  return {
    version: REPLAY_QUORUM_VERSION,
    seal_id: sealId,
    replay_snapshot_hash: replaySnapshotHash,
    created_at: now,
    updated_at: now,
    readonly: true,
    messages: {},
    message_count: 0,
    agents_present: [],
    missing_agents: [...SENTINEL_AGENTS],
    canon: [
      'Replay Council Bus stores agent reviews over a reconstructed past-state hash.',
      'Each Sentinel agent may have at most one current message per seal_id.',
      'Council messages do not promote, mint, unlock, rollback, or rewrite Canon by themselves.',
    ],
  };
}

function candidateReason(status: ReplayQuorumStatus): string {
  switch (status) {
    case 'approved':
      return 'Replay quorum reached over one snapshot hash. Operator may consider promotion in a later phase.';
    case 'blocked':
      return 'Replay quorum blocked by flag threshold. Operator should review agent rationales before any future attempt.';
    case 'contested':
      return 'Replay council is contested. More review or agent correction is required before candidate status.';
    default:
      return 'Replay council is still pending. Missing or abstaining agents prevent candidate status.';
  }
}

function evaluateCouncilRecord(record: ReplayCouncilRecord): ReplayQuorumEvaluation {
  const normalized = normalizeCouncilRecord(record);
  const messages = SENTINEL_AGENTS.map((agent) => normalized.messages[agent]).filter((message): message is ReplayCouncilMessage => Boolean(message));
  const approvedCount = messages.filter((message) => message.verdict === 'pass').length;
  const flaggedCount = messages.filter((message) => message.verdict === 'flag').length;
  const abstainedCount = messages.filter((message) => message.verdict === 'abstain').length;
  const quorumReached = approvedCount >= REPLAY_QUORUM_THRESHOLD;
  const blockingReached = flaggedCount >= REPLAY_QUORUM_THRESHOLD;
  const contested = approvedCount > 0 && flaggedCount > 0 && !quorumReached && !blockingReached;
  const status: ReplayQuorumStatus = quorumReached
    ? 'approved'
    : blockingReached
      ? 'blocked'
      : contested
        ? 'contested'
        : 'pending';
  const candidateState: ReplayCandidateState = quorumReached ? 'candidate' : blockingReached ? 'blocked' : 'not_ready';
  const quorumHash = quorumReached
    ? hashPayload({
        seal_id: normalized.seal_id,
        replay_snapshot_hash: normalized.replay_snapshot_hash,
        approved_agents: messages
          .filter((message) => message.verdict === 'pass')
          .map((message) => message.from_agent)
          .sort(),
        threshold: REPLAY_QUORUM_THRESHOLD,
      })
    : null;

  return {
    version: REPLAY_QUORUM_VERSION,
    seal_id: normalized.seal_id,
    replay_snapshot_hash: normalized.replay_snapshot_hash,
    quorum_threshold: REPLAY_QUORUM_THRESHOLD,
    required_agents: SENTINEL_AGENTS,
    approved_count: approvedCount,
    flagged_count: flaggedCount,
    abstained_count: abstainedCount,
    message_count: normalized.message_count,
    missing_agents: normalized.missing_agents,
    agents_present: normalized.agents_present,
    quorum_reached: quorumReached,
    quorum_hash: quorumHash,
    status,
    back_attestation_candidate: quorumReached,
    candidate_state: candidateState,
    candidate_reason: candidateReason(status),
    operator_action_required: quorumReached,
    promotion_preconditions: [
      'Operator explicitly approves promotion in a later phase.',
      'Replay snapshot hash still matches stored seal data at promotion time.',
      'Quorum hash is preserved with approved agent set.',
      'Original seal history remains preserved; replay does not rewrite original seal time.',
      'Promotion route confirms no conflicting successor state before mutation.',
    ],
    readonly: true,
    canon: [
      'Replay quorum evaluates Council Bus messages over one replay_snapshot_hash.',
      'Replay quorum approval does not promote a seal by itself.',
      'Back-attestation candidate means operator promotion may be considered in a later phase.',
      'No Vault mutation, Canon rewrite, MIC issuance, Fountain unlock, or rollback occurs here.',
    ],
  };
}

export function buildReplaySnapshotFromSeal(seal: Seal): ReplaySnapshot {
  const replay_snapshot_hash = hashPayload(replayHashInput(seal));
  return {
    version: REPLAY_QUORUM_VERSION,
    seal_id: seal.seal_id,
    seal_hash: seal.seal_hash,
    previous_seal_hash: seal.prev_seal_hash,
    deposit_hashes: seal.deposit_hashes,
    deposit_hashes_count: seal.deposit_hashes.length,
    cycle_at_seal: seal.cycle_at_seal,
    sealed_at: seal.sealed_at,
    gi_at_seal: seal.gi_at_seal,
    mode_at_seal: seal.mode_at_seal,
    source_entries: seal.source_entries,
    status_at_replay: seal.status,
    fountain_status_at_replay: seal.fountain_status,
    substrate_pointer: {
      attestation_id: seal.substrate_attestation_id ?? null,
      event_hash: seal.substrate_event_hash ?? null,
      attested_at: seal.substrate_attested_at ?? null,
      error: seal.substrate_attestation_error ?? null,
    },
    replay_snapshot_hash,
    readonly: true,
    canon: [
      'Replay snapshot is a reconstructed past-state hash.',
      'Replay quorum must attest the same replay_snapshot_hash.',
      'Replay quorum does not pretend agents signed at original seal time.',
      'Replay snapshot does not promote, mutate, mint, unlock, or rollback by itself.',
    ],
  };
}

export function buildReplayCouncilMessageDraft(args: ReplayCouncilSubmission): ReplayCouncilMessage {
  return {
    version: REPLAY_QUORUM_VERSION,
    ...args,
    signature_hash: hashPayload({ agent: args.from_agent, signature: args.signature }),
    readonly: true,
  };
}

export async function buildReplaySnapshotResponse(sealId: string | null): Promise<ReplaySnapshotResponse | ReplaySnapshotError> {
  if (!sealId) return { ok: false, error: 'missing_seal_id', readonly: true };
  const seal = await getSeal(sealId);
  if (!seal) return { ok: false, error: 'seal_not_found', readonly: true };
  const snapshot = buildReplaySnapshotFromSeal(seal);
  return {
    ok: true,
    readonly: true,
    snapshot,
    council_contract: {
      required_agents: SENTINEL_AGENTS,
      message_shape: {
        version: REPLAY_QUORUM_VERSION,
        from_agent: 'ATLAS',
        seal_id: snapshot.seal_id,
        replay_snapshot_hash: snapshot.replay_snapshot_hash,
        verdict: 'abstain',
        reason: 'Agent reviews the reconstructed past-state hash before quorum.',
        signed_at: 'ISO-8601',
        signature: 'agent signature over replay_snapshot_hash',
        signature_hash: 'sha256({agent, signature})',
        readonly: true,
      },
    },
  };
}

export async function readReplayCouncil(sealId: string | null): Promise<ReplayCouncilResponse | ReplayCouncilError> {
  if (!sealId) return { ok: false, error: 'missing_seal_id', readonly: true };
  const snapshotResponse = await buildReplaySnapshotResponse(sealId);
  if (!snapshotResponse.ok) return snapshotResponse;
  const stored = await kvGet<ReplayCouncilRecord>(replayCouncilKey(sealId));
  const record = stored ?? emptyCouncilRecord(sealId, snapshotResponse.snapshot.replay_snapshot_hash);
  return { ok: true, readonly: true, record: normalizeCouncilRecord(record) };
}

export async function submitReplayCouncilMessage(body: unknown): Promise<ReplayCouncilResponse | ReplayCouncilError> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'missing_body', readonly: true };
  const candidate = body as Partial<ReplayCouncilSubmission>;
  if (!candidate.seal_id) return { ok: false, error: 'missing_seal_id', readonly: true };
  if (!candidate.from_agent || !isSentinelAgent(candidate.from_agent)) return { ok: false, error: 'invalid_agent', readonly: true };
  if (!candidate.verdict || !isReplayCouncilVerdict(candidate.verdict)) return { ok: false, error: 'invalid_verdict', readonly: true };
  if (!isIsoDateString(candidate.signed_at)) return { ok: false, error: 'invalid_signed_at', readonly: true };
  if (!hasNonEmptyString(candidate.signature)) return { ok: false, error: 'missing_signature', readonly: true };
  const snapshotResponse = await buildReplaySnapshotResponse(candidate.seal_id);
  if (!snapshotResponse.ok) return snapshotResponse;
  if (candidate.replay_snapshot_hash !== snapshotResponse.snapshot.replay_snapshot_hash) {
    return { ok: false, error: 'snapshot_hash_mismatch', readonly: true };
  }
  if (!signatureReferencesSnapshot(candidate.signature, candidate.replay_snapshot_hash)) {
    return { ok: false, error: 'invalid_signature_scope', readonly: true };
  }

  const current = await kvGet<ReplayCouncilRecord>(replayCouncilKey(candidate.seal_id));
  const base = current ?? emptyCouncilRecord(candidate.seal_id, candidate.replay_snapshot_hash);
  const message = buildReplayCouncilMessageDraft({
    from_agent: candidate.from_agent,
    seal_id: candidate.seal_id,
    replay_snapshot_hash: candidate.replay_snapshot_hash,
    verdict: candidate.verdict,
    reason: candidate.reason ?? '',
    signed_at: candidate.signed_at,
    signature: candidate.signature,
  });
  const next: ReplayCouncilRecord = normalizeCouncilRecord({
    ...base,
    version: REPLAY_QUORUM_VERSION,
    replay_snapshot_hash: candidate.replay_snapshot_hash,
    updated_at: new Date().toISOString(),
    messages: {
      ...base.messages,
      [candidate.from_agent]: message,
    },
  });
  const wrote = await kvSet(replayCouncilKey(candidate.seal_id), next);
  if (!wrote) return { ok: false, error: 'write_failed', readonly: true };
  return { ok: true, readonly: true, record: next };
}

export async function evaluateReplayQuorum(sealId: string | null): Promise<ReplayQuorumResponse | ReplayCouncilError> {
  const council = await readReplayCouncil(sealId);
  if (!council.ok) return council;
  return {
    ok: true,
    readonly: true,
    evaluation: evaluateCouncilRecord(council.record),
  };
}
