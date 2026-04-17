/**
 * Vault v2 — Sealed Reserve types.
 *
 * Spec: docs/protocols/vault-v2-sealed-reserve.md
 *
 * Each Seal is a discrete 50-unit reserve parcel with five independent
 * Sentinel attestations. Hash-chained to its predecessor.
 */

export type SentinelAgent = 'ATLAS' | 'ZEUS' | 'EVE' | 'JADE' | 'AUREA';

export const SENTINEL_AGENTS: readonly SentinelAgent[] = [
  'ATLAS',
  'ZEUS',
  'EVE',
  'JADE',
  'AUREA',
] as const;

export type SealStatus =
  | 'forming' // candidate created, awaiting attestations
  | 'attested' // quorum passed, Seal minted
  | 'quarantined' // quorum failed (non-ZEUS), awaiting operator review
  | 'rejected'; // ZEUS rejected, auto-dissolve in 24h

export type FountainStatus =
  | 'pending' // attested, GI conditions not yet met
  | 'activating' // GI sustain window in progress
  | 'emitted' // Fountain drained this Seal
  | 'expired'; // 90 cycles without activation

export type Verdict = 'pass' | 'flag' | 'reject';

export type Posture = 'confident' | 'cautionary' | 'stressed' | 'degraded';

export type Mode = 'green' | 'yellow' | 'red';

/**
 * AUREA's attestation carries a posture stamp in addition to the standard
 * verdict fields. Other agents omit this field.
 */
export type SealAttestation = {
  agent: SentinelAgent;
  verdict: Verdict;
  rationale: string;
  /** Present when the agent supplied MII at seal time; omitted when unknown. */
  mii_at_attestation?: number | null;
  gi_at_attestation: number;
  timestamp: string;
  signature: string;
  /** AUREA only. Undefined for other agents. */
  posture?: Posture;
};

export type Seal = {
  seal_id: string;
  sequence: number;
  cycle_at_seal: string;
  sealed_at: string;
  reserve: 50;
  gi_at_seal: number;
  mode_at_seal: Mode;
  source_entries: number;
  deposit_hashes: string[];
  /**
   * Deposit content hashes that contributed to the *next* forming parcel after
   * this seal closed (numeric overflow from the crossing deposit). Preserves
   * provenance across the 50-unit boundary.
   */
  carried_forward_deposit_hashes?: string[];
  prev_seal_hash: string | null;
  seal_hash: string;
  attestations: Partial<Record<SentinelAgent, SealAttestation>>;
  status: SealStatus;
  fountain_status: FountainStatus;
  fountain_emitted_at: string | null;
  /** AUREA's posture, copied out of attestations for quick lookup. */
  posture: Posture | null;
};

/**
 * A Seal candidate is the pre-attestation record. Once all attestations are
 * collected and quorum evaluated, it transitions into a full Seal.
 */
export type SealCandidate = {
  seal_id: string;
  sequence: number;
  cycle_at_seal: string;
  sealed_at: string;
  reserve: 50;
  gi_at_seal: number;
  mode_at_seal: Mode;
  source_entries: number;
  deposit_hashes: string[];
  /**
   * Set when this candidate is formed with overflow into the next parcel;
   * copied onto the finalized Seal for audit.
   */
  carried_forward_deposit_hashes?: string[];
  prev_seal_hash: string | null;
  seal_hash: string;
  attestations: Partial<Record<SentinelAgent, SealAttestation>>;
  posture: Posture | null;
  status: 'forming';
  requested_at: string;
  timeout_at: string;
};

/**
 * Attestation request payload sent to Sentinel agents.
 * Agent responds via POST /api/vault/seal/attest.
 */
export type AttestationRequest = {
  seal_id: string;
  seal_hash: string;
  sequence: number;
  cycle_at_seal: string;
  gi_at_seal: number;
  source_entries: number;
  deposit_hashes: string[];
  prev_seal_hash: string | null;
  requested_at: string;
  timeout_at: string;
};

export type AttestationSubmission = {
  seal_id: string;
  agent: SentinelAgent;
  verdict: Verdict;
  rationale: string;
  signature: string;
  /** Optional; when set must be a finite number (MII snapshot at attestation). */
  mii_at_attestation?: number;
  /** Required only from AUREA. */
  posture?: Posture;
};
