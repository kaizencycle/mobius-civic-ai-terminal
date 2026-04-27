import { hashPayload } from '@/lib/agents/signatures';
import { getSeal } from '@/lib/vault-v2/store';
import type { Seal, SentinelAgent } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';

export const REPLAY_QUORUM_VERSION = 'C-294.phase1-2.v1' as const;

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

export function buildReplayCouncilMessageDraft(args: {
  from_agent: SentinelAgent;
  seal_id: string;
  replay_snapshot_hash: string;
  verdict: ReplayCouncilVerdict;
  reason: string;
  signed_at: string;
  signature: string;
}): ReplayCouncilMessage {
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
