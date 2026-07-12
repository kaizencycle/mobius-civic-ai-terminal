/**
 * Reserve Block .dat Canon Types
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { SENTINEL_AGENTS, type Seal, type SentinelAgent } from '@/lib/vault-v2/types';

/** Raw vault block as stored in KV (mapped from Seal). */
export interface VaultSealedBlock {
  seal_id: string;
  block_number: number;
  sealed_at: string;
  cycle: string;
  quorum: SentinelAgent[];
  gi_at_seal: number;
  source_entries: number;
  fountain_status: string;
  substrate_attestation_id?: string;
  dat_canonized?: boolean;
  dat_file?: string;
}

/** .dat record format (NDJSON, one line per block). */
export interface DatBlockRecord {
  block_id: string;
  block_number: number;
  mic_value: number;
  sealed_at: string;
  cycle: string;
  seal_quorum: string[];
  gi_at_seal: number;
  source_entries: number;
  prev_hash: string;
  block_hash: string;
}

export interface DatManifest {
  version: string;
  generated_at: string;
  total_blocks: number;
  total_mic: number;
  chain_tip_hash: string;
  files: Record<string, DatManifestEntry>;
}

export interface DatManifestEntry {
  range: [number, number];
  sha256: string;
  block_count: number;
}

export interface DatHashAnchorPayload {
  dat_file: string;
  file_hash: string;
  block_range_start: number;
  block_range_end: number;
  block_count: number;
  chain_tip_hash: string;
  manifest_hash?: string;
  version: string;
  canonized_at: string;
}

export interface DatHashAnchorResponse {
  status: string;
  action: 'anchored' | 'idempotent';
  dat_file: string;
  blocks: string;
  chain_tip: string;
}

export interface CanonizationResult {
  epicon_cycle: string;
  total_blocks_processed: number;
  total_mic_canonized: number;
  dat_files_written: string[];
  manifest_hash: string;
  chain_tip_hash: string;
  cpc_anchors_posted: number;
  cpc_anchors_idempotent: number;
  errors: CanonizationError[];
  completed_at: string;
  substrate_commit_ready: boolean;
}

export interface CanonizationError {
  block_number?: number;
  dat_file?: string;
  stage: 'fetch' | 'hash' | 'write' | 'cpc_anchor';
  message: string;
  retryable: boolean;
}

export type AttestationDisplayStatus =
  | 'attested'
  | 'canonized_via_dat'
  | 'partial_canonized_via_dat'
  | 'pending'
  | 'error'
  | 'quarantined';

/** Map a vault-v2 Seal to a canonizable block record. */
export function sealToVaultBlock(seal: Seal): VaultSealedBlock {
  const signed = SENTINEL_AGENTS.filter((agent) => seal.attestations?.[agent]?.signature);
  const quorum: SentinelAgent[] =
    seal.status === 'attested' ? [...SENTINEL_AGENTS] : signed.length > 0 ? signed : [...SENTINEL_AGENTS];
  return {
    seal_id: seal.seal_id,
    block_number: seal.sequence,
    sealed_at: seal.sealed_at,
    cycle: seal.cycle_at_seal,
    quorum,
    gi_at_seal: seal.gi_at_seal,
    source_entries: seal.source_entries,
    fountain_status: seal.fountain_status,
    substrate_attestation_id: seal.substrate_attestation_id ?? undefined,
  };
}
