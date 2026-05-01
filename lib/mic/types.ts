/**
 * MIC runtime + proof surface — UI / API contract.
 * Canonical hash creation for attestations / seals may also run server-side here
 * for degraded/standalone Terminal; monorepo remains source for ledger writes.
 */

export interface MicHashMeta {
  hash?: string;
  hash_algorithm?: 'sha256';
  previous_hash?: string | null;
}

export type MicTrancheStatus = 'in_progress' | 'eligible_for_seal' | 'sealed';

export type MicSustainStatus = 'not_started' | 'in_progress' | 'satisfied';

export type MicReplayStatus = 'clear' | 'elevated' | 'blocked';

export type MicNoveltyStatus = 'weak' | 'acceptable' | 'strong';

export type MicQuorumStatus = 'pending' | 'partial' | 'satisfied';

export type MicMintReadiness =
  | 'not_eligible'
  | 'reserve_only'
  | 'seal_ready'
  | 'quorum_pending'
  | 'fountain_ready';

export interface MicReadinessResponse {
  schema: 'MIC_READINESS_V1';
  cycle: string;
  gi: number | null;
  mintThresholdGi: number;

  reserve: {
    inProgressBalance: number;
    trancheTarget: number;
    sealedReserveTotal: number;
    trancheStatus: MicTrancheStatus;
    /** v1 cumulative compat (same as balance_reserve on vault status). */
    balanceReserveV1: number;
  };

  sustain: {
    consecutiveEligibleCycles: number;
    requiredCycles: number;
    status: MicSustainStatus;
    sustain_tracking_placeholder: boolean;
    lastEligibleCycle?: string | null;
    lastCheckedCycle?: string | null;
    /** GI threshold required for a cycle to count as eligible (0.95) */
    gi_threshold?: number;
    /** Whether the most recently checked cycle met the GI threshold */
    last_cycle_eligible?: boolean | null;
  };

  replay: {
    replayPressure: number;
    status: MicReplayStatus;
    /** Hours for half-life decay of ingest-side duplicate pressure (when KV-backed). */
    replay_decay_half_life_hours?: number;
  };

  novelty: {
    noveltyScore: number;
    status: MicNoveltyStatus;
  };

  quorum: {
    required: string[];
    attested: string[];
    status: MicQuorumStatus;
    attestations_received: number;
    attestations_needed: number;
    seal_candidate_in_flight: boolean;
  };

  fountain: {
    locked: boolean;
    eligible: boolean;
    unlocked: boolean;
    lane: string;
  };

  mintReadiness: MicMintReadiness;

  vault: {
    reserve_lane: string | null;
    fountain_status: string | null;
    gi_threshold_met: boolean | null;
    sustain_cycles_met: boolean | null;
    reserve_threshold_met: boolean | null;
    candidate_attestation_state: unknown;
  };

  updatedAt: string;

  /** Optional: hash of readiness payload for audit (server-assembled proof). */
  readiness_proof?: MicHashMeta;
}

export interface MicRewardAttestationSummary extends MicHashMeta {
  type?: 'MIC_REWARD_V2';
  nodeId: string;
  mic: number;
  timestamp: string;
  source?: 'vault_deposit_summary' | 'ledger';
  breakdown?: {
    integrity?: number;
    humanIntent?: number;
    coordination?: number;
    resilience?: number;
    multipliers?: {
      giMultiplier?: number;
      consensusMultiplier?: number;
      noveltyMultiplier?: number;
      antiDriftMultiplier?: number;
    };
  };
}

export interface MicSealSnapshot extends MicHashMeta {
  type?: 'MIC_SEAL_V1';
  cycle: string;
  gi: number;
  timestamp: string;
  reserve: {
    inProgressBalance: number;
    trancheTarget: number;
    sealedReserveTotal: number;
    trancheStatus: MicTrancheStatus;
  };
  sustain: {
    consecutiveEligibleCycles: number;
    requiredCycles: number;
    status: MicSustainStatus;
  };
  replay: {
    replayPressure: number;
    status: MicReplayStatus;
  };
  novelty: {
    noveltyScore: number;
    status: MicNoveltyStatus;
  };
  quorum: {
    required: string[];
    attested: string[];
    status: MicQuorumStatus;
  };
}

export interface MicGenesisBlockSummary extends MicHashMeta {
  type?: 'MIC_GENESIS_BLOCK';
  cycle: string;
  gi: number;
  mint: number;
  timestamp: string;
  allocation?: {
    reserve?: number;
    operator?: number;
    sentinel?: number;
    civic?: number;
    burn?: number;
  };
}
