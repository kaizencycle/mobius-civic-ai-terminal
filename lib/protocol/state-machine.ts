/**
 * Mobius Canonical State Machine
 *
 * Phase 2 hardening layer. These enums describe object lifecycle, not UI copy.
 * Existing legacy fields can continue to exist, but new protocol surfaces should
 * map to these states before deciding whether something is hot, canon, sealed,
 * disputed, or immortalized.
 */

export const CANONICAL_STATE_MACHINE_VERSION = 'C-293.phase2.v1' as const;

export type VaultBlockState =
  | 'accumulating'
  | 'candidate'
  | 'quorum_pending'
  | 'attested'
  | 'substrate_attested'
  | 'immortalized'
  | 'quarantined'
  | 'rejected'
  | 'fountain_pending'
  | 'fountain_eligible'
  | 'emitted'
  | 'expired';

export type JournalCanonState =
  | 'hot'
  | 'saved'
  | 'canonical'
  | 'substrate_attested'
  | 'contested'
  | 'archived';

export type LedgerCanonState =
  | 'hot'
  | 'candidate'
  | 'attested'
  | 'sealed'
  | 'immortalized'
  | 'blocked'
  | 'disputed';

export type QuorumCanonState =
  | 'none'
  | 'forming'
  | 'waiting'
  | 'ready'
  | 'attested'
  | 'quarantined'
  | 'rejected'
  | 'substrate_pending'
  | 'immortalized';

export type CanonicalObjectKind = 'vault_block' | 'journal' | 'ledger' | 'quorum';

export type CanonicalTransition<TState extends string> = {
  from: TState;
  to: TState;
  reason: string;
};

export type CanonicalStateMachine = {
  version: typeof CANONICAL_STATE_MACHINE_VERSION;
  states: {
    vault_block: readonly VaultBlockState[];
    journal: readonly JournalCanonState[];
    ledger: readonly LedgerCanonState[];
    quorum: readonly QuorumCanonState[];
  };
  transitions: {
    vault_block: readonly CanonicalTransition<VaultBlockState>[];
    journal: readonly CanonicalTransition<JournalCanonState>[];
    ledger: readonly CanonicalTransition<LedgerCanonState>[];
    quorum: readonly CanonicalTransition<QuorumCanonState>[];
  };
};

export const VAULT_BLOCK_STATES = [
  'accumulating',
  'candidate',
  'quorum_pending',
  'attested',
  'substrate_attested',
  'immortalized',
  'quarantined',
  'rejected',
  'fountain_pending',
  'fountain_eligible',
  'emitted',
  'expired',
] as const satisfies readonly VaultBlockState[];

export const JOURNAL_CANON_STATES = [
  'hot',
  'saved',
  'canonical',
  'substrate_attested',
  'contested',
  'archived',
] as const satisfies readonly JournalCanonState[];

export const LEDGER_CANON_STATES = [
  'hot',
  'candidate',
  'attested',
  'sealed',
  'immortalized',
  'blocked',
  'disputed',
] as const satisfies readonly LedgerCanonState[];

export const QUORUM_CANON_STATES = [
  'none',
  'forming',
  'waiting',
  'ready',
  'attested',
  'quarantined',
  'rejected',
  'substrate_pending',
  'immortalized',
] as const satisfies readonly QuorumCanonState[];

export const CANONICAL_STATE_MACHINE: CanonicalStateMachine = {
  version: CANONICAL_STATE_MACHINE_VERSION,
  states: {
    vault_block: VAULT_BLOCK_STATES,
    journal: JOURNAL_CANON_STATES,
    ledger: LEDGER_CANON_STATES,
    quorum: QUORUM_CANON_STATES,
  },
  transitions: {
    vault_block: [
      { from: 'accumulating', to: 'candidate', reason: 'reserve reaches 50 MIC and candidate forms' },
      { from: 'candidate', to: 'quorum_pending', reason: 'candidate has seal hash and awaits Sentinel attestations' },
      { from: 'quorum_pending', to: 'attested', reason: 'quorum passes required Sentinel threshold' },
      { from: 'attested', to: 'substrate_attested', reason: 'Substrate write returns civic proof pointer' },
      { from: 'substrate_attested', to: 'immortalized', reason: 'seal has both substrate_attestation_id and substrate_event_hash' },
      { from: 'quorum_pending', to: 'quarantined', reason: 'quorum fails without ZEUS hard reject' },
      { from: 'quorum_pending', to: 'rejected', reason: 'ZEUS reject or fatal quorum contradiction' },
      { from: 'immortalized', to: 'fountain_pending', reason: 'block is proof-complete but GI sustain not met' },
      { from: 'fountain_pending', to: 'fountain_eligible', reason: 'GI sustain window passes' },
      { from: 'fountain_eligible', to: 'emitted', reason: 'Fountain drains sealed block into economic emission' },
      { from: 'fountain_pending', to: 'expired', reason: 'activation window expires before Fountain eligibility' },
    ],
    journal: [
      { from: 'hot', to: 'saved', reason: 'savepoint cache preserves last known chamber truth' },
      { from: 'saved', to: 'canonical', reason: 'entry is promoted into canon/catalog or ledger feed' },
      { from: 'canonical', to: 'substrate_attested', reason: 'entry receives Substrate proof pointer' },
      { from: 'canonical', to: 'contested', reason: 'agent or operator disputes entry truth' },
      { from: 'substrate_attested', to: 'archived', reason: 'entry is retained as historical canon' },
    ],
    ledger: [
      { from: 'hot', to: 'candidate', reason: 'event becomes eligible for proof promotion' },
      { from: 'candidate', to: 'attested', reason: 'verification evidence passes' },
      { from: 'attested', to: 'sealed', reason: 'event joins sealed proof set' },
      { from: 'sealed', to: 'immortalized', reason: 'Substrate/civic ledger hash pointer is recorded' },
      { from: 'candidate', to: 'blocked', reason: 'promotion gate rejects or contradicts event' },
      { from: 'attested', to: 'disputed', reason: 'post-attestation challenge is raised' },
    ],
    quorum: [
      { from: 'none', to: 'forming', reason: 'candidate state is requested' },
      { from: 'forming', to: 'waiting', reason: 'candidate exists but attestations are incomplete' },
      { from: 'waiting', to: 'ready', reason: 'required attestation count is reached' },
      { from: 'ready', to: 'attested', reason: 'quorum decision passes' },
      { from: 'ready', to: 'quarantined', reason: 'quorum produces non-fatal flags or insufficient pass set' },
      { from: 'ready', to: 'rejected', reason: 'ZEUS or fatal gate rejects the candidate' },
      { from: 'attested', to: 'substrate_pending', reason: 'seal is attested but Substrate pointer is missing' },
      { from: 'substrate_pending', to: 'immortalized', reason: 'Substrate pointer is attached to the finalized seal' },
    ],
  },
} as const;

export function isKnownCanonicalState(kind: CanonicalObjectKind, state: string): boolean {
  return (CANONICAL_STATE_MACHINE.states[kind] as readonly string[]).includes(state);
}

export function allowedTransitions(kind: CanonicalObjectKind, from: string): readonly CanonicalTransition<string>[] {
  return CANONICAL_STATE_MACHINE.transitions[kind].filter((transition) => transition.from === from);
}

export function canTransition(kind: CanonicalObjectKind, from: string, to: string): boolean {
  return CANONICAL_STATE_MACHINE.transitions[kind].some((transition) => transition.from === from && transition.to === to);
}

export function deriveQuorumCanonState(args: {
  candidateInFlight: boolean;
  attestationsReceived: number;
  attestationsRequired: number;
  latestStatus?: string | null;
  substrateAttestationId?: string | null;
  substrateEventHash?: string | null;
}): QuorumCanonState {
  if (args.latestStatus === 'rejected') return 'rejected';
  if (args.latestStatus === 'quarantined') return 'quarantined';
  if (args.latestStatus === 'attested') {
    if (args.substrateAttestationId && args.substrateEventHash) return 'immortalized';
    return 'substrate_pending';
  }
  if (!args.candidateInFlight) return 'none';
  if (args.attestationsReceived >= args.attestationsRequired) return 'ready';
  return 'waiting';
}

export function deriveVaultBlockState(args: {
  candidateInFlight: boolean;
  inProgressBalance: number;
  blockSize: number;
  latestStatus?: string | null;
  fountainStatus?: string | null;
  substrateAttestationId?: string | null;
  substrateEventHash?: string | null;
}): VaultBlockState {
  if (args.latestStatus === 'rejected') return 'rejected';
  if (args.latestStatus === 'quarantined') return 'quarantined';
  if (args.latestStatus === 'attested') {
    if (args.fountainStatus === 'emitted') return 'emitted';
    if (args.fountainStatus === 'expired') return 'expired';
    if (args.substrateAttestationId && args.substrateEventHash) return 'immortalized';
    if (args.substrateAttestationId) return 'substrate_attested';
    return 'attested';
  }
  if (args.candidateInFlight) return 'quorum_pending';
  if (args.inProgressBalance >= args.blockSize) return 'candidate';
  return 'accumulating';
}
