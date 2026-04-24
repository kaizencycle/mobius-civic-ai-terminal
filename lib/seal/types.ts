export type TrancheState = {
  tranche_id: string;
  cycle_opened: string;
  current_units: number;
  target_units: number;
  sealed: boolean;
  sealed_reserve_total: number;
};

export type AttestationAgent = 'ZEUS' | 'ATLAS' | 'HERMES';

export type AttestationResult = {
  agent: AttestationAgent;
  status: 'pass' | 'fail';
  score: number;
  flags?: string[];
  notes?: string;
};

export type SealVerdict = 'pass' | 'flag' | 'fail';

export type SealStatus =
  | 'candidate'
  | 'quarantined'
  | 're_attesting'
  | 're_attesting_passed'
  | 'finalized'
  | 'failed_permanent';

export type SealAttestation = {
  agent: string;
  verdict: SealVerdict;
  rationale: string;
  gi_at_attestation: number;
  timestamp: string;
  signature: string;
};

export type SealReconciliationMeta = {
  quarantine_reason: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  last_attempt_result: 'pass' | 'fail' | null;
  finalized_at: string | null;
  failed_at: string | null;
  reserve_increment_applied: boolean;
};

export type SealRecord = {
  type: 'MOBIUS_SEAL_V1';
  seal_id: string;
  tranche_id: string;
  cycle: string;
  units: number;
  timestamp: string;
  attestation: {
    zeus: AttestationResult;
    atlas: AttestationResult;
    hermes?: AttestationResult;
  };
  source_hash: string;
  seal_hash: string;
};

export type ReconciliationSealRecord = {
  seal_id: string;
  sequence: number;
  cycle_at_seal: string;
  sealed_at: string;
  reserve: number;
  gi_at_seal: number;
  mode_at_seal: string;
  source_entries: number;
  deposit_hashes: string[];
  carried_forward_deposit_hashes?: string[];
  prev_seal_hash: string | null;
  seal_hash: string;
  attestations: Record<string, SealAttestation>;
  status: SealStatus;
  fountain_status?: string | null;
  fountain_emitted_at?: string | null;
  posture?: string | null;
  reconciliation: SealReconciliationMeta;
};
