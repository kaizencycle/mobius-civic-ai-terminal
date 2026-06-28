/**
 * SHA-256 hash chain for Reserve Block .dat records.
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { createHash } from 'crypto';
import type { DatBlockRecord, VaultSealedBlock } from './types';

export const GENESIS_HASH = '0'.repeat(64);
export const DAT_VERSION = '1.0';
export const MIC_PER_BLOCK = 50.0;
export const BLOCKS_PER_DAT_FILE = 100;

export function hashDatRecord(
  record: Omit<DatBlockRecord, 'block_hash'>,
  prevHash: string,
): string {
  const preimage = JSON.stringify(record);
  const raw = createHash('sha256').update(preimage + prevHash).digest('hex');
  return `sha256:${raw}`;
}

export function buildDatRecord(block: VaultSealedBlock, prevHash: string): DatBlockRecord {
  const partial: Omit<DatBlockRecord, 'block_hash'> = {
    block_id: block.seal_id,
    block_number: block.block_number,
    mic_value: MIC_PER_BLOCK,
    sealed_at: block.sealed_at,
    cycle: block.cycle,
    seal_quorum: block.quorum,
    gi_at_seal: block.gi_at_seal,
    source_entries: block.source_entries,
    prev_hash: prevHash,
  };

  return {
    ...partial,
    block_hash: hashDatRecord(partial, prevHash),
  };
}

export function hashDatFile(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export interface ChainVerificationResult {
  valid: boolean;
  verified_count: number;
  first_invalid_block?: number;
  error?: string;
}

export function verifyDatChain(
  records: DatBlockRecord[],
  expectedPrevHash: string = GENESIS_HASH,
): ChainVerificationResult {
  let prevHash = expectedPrevHash;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if (record.prev_hash !== prevHash) {
      return {
        valid: false,
        verified_count: i,
        first_invalid_block: record.block_number,
        error: `prev_hash mismatch at block ${record.block_number}`,
      };
    }

    const partial: Omit<DatBlockRecord, 'block_hash'> = {
      block_id: record.block_id,
      block_number: record.block_number,
      mic_value: record.mic_value,
      sealed_at: record.sealed_at,
      cycle: record.cycle,
      seal_quorum: record.seal_quorum,
      gi_at_seal: record.gi_at_seal,
      source_entries: record.source_entries,
      prev_hash: record.prev_hash,
    };

    const expectedHash = hashDatRecord(partial, prevHash);

    if (record.block_hash !== expectedHash) {
      return {
        valid: false,
        verified_count: i,
        first_invalid_block: record.block_number,
        error: `block_hash mismatch at block ${record.block_number}`,
      };
    }

    prevHash = record.block_hash;
  }

  return {
    valid: true,
    verified_count: records.length,
  };
}

export function parseDatFile(content: string): DatBlockRecord[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line) as DatBlockRecord;
      } catch (e) {
        throw new Error(
          `Failed to parse .dat line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });
}

export function datFileName(fileIndex: number): string {
  return `blk${String(fileIndex).padStart(4, '0')}.dat`;
}
