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
