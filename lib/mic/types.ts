/**
 * MIC runtime surface — UI / API contract (MIC_READINESS_V1).
 * Values are assembled server-side; the Terminal displays them without policy logic.
 */

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
    /** True when KV sustain is not wired; UI should show "not tracked" not fake numbers. */
    sustain_tracking_placeholder: boolean;
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
    attestations_received: number;
    attestations_needed: number;
    seal_candidate_in_flight: boolean;
  };

  fountain: {
    locked: boolean;
    eligible: boolean;
    unlocked: boolean;
    /** Raw lane from vault status (locked | preview | tracking | unsealed | active). */
    lane: string;
  };

  mintReadiness: MicMintReadiness;

  /** Echo fields from vault status for operator cross-check (not recomputed in UI). */
  vault: {
    reserve_lane: string | null;
    fountain_status: string | null;
    gi_threshold_met: boolean | null;
    sustain_cycles_met: boolean | null;
    reserve_threshold_met: boolean | null;
    candidate_attestation_state: unknown;
  };

  updatedAt: string;
}

export interface MicRewardAttestationSummary {
  nodeId: string;
  mic: number;
  timestamp: string;
  source: 'vault_deposit_summary' | 'ledger';
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

export interface MicGenesisBlockSummary {
  cycle: string;
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
