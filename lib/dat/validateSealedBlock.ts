/**
 * Pre-export validation for Reserve Block .dat canonization.
 * EPICON: C-368 PR7 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { VAULT_QUORUM_MIN_PASSES } from '@/lib/vault-v2/constants';
import type { VaultSealedBlock } from './types';

const ZEUS_AGENT = 'ZEUS' as const;

export class SealedBlockValidationError extends Error {
  constructor(
    public readonly blockNumber: number,
    public readonly sealId: string,
    message: string,
  ) {
    super(`block ${blockNumber} (${sealId}): ${message}`);
    this.name = 'SealedBlockValidationError';
  }
}

export function validateSealedBlock(block: VaultSealedBlock, expectedNumber?: number): void {
  if (expectedNumber !== undefined && block.block_number !== expectedNumber) {
    throw new SealedBlockValidationError(
      block.block_number,
      block.seal_id,
      `expected block_number ${expectedNumber}, got ${block.block_number}`,
    );
  }

  if (!block.seal_id?.trim()) {
    throw new SealedBlockValidationError(block.block_number, block.seal_id, 'missing seal_id');
  }

  if (!block.sealed_at?.trim()) {
    throw new SealedBlockValidationError(block.block_number, block.seal_id, 'missing sealed_at');
  }

  if (!block.cycle?.trim()) {
    throw new SealedBlockValidationError(block.block_number, block.seal_id, 'missing cycle');
  }

  if (typeof block.gi_at_seal !== 'number' || !Number.isFinite(block.gi_at_seal)) {
    throw new SealedBlockValidationError(block.block_number, block.seal_id, 'gi_at_seal must be a finite number');
  }

  if (typeof block.source_entries !== 'number' || !Number.isFinite(block.source_entries) || block.source_entries < 0) {
    throw new SealedBlockValidationError(
      block.block_number,
      block.seal_id,
      'source_entries must be a non-negative number',
    );
  }

  const quorum = block.quorum ?? [];
  if (quorum.length < VAULT_QUORUM_MIN_PASSES) {
    throw new SealedBlockValidationError(
      block.block_number,
      block.seal_id,
      `seal_quorum must have at least ${VAULT_QUORUM_MIN_PASSES} signed agents, got ${quorum.length}`,
    );
  }

  if (!quorum.includes(ZEUS_AGENT)) {
    throw new SealedBlockValidationError(
      block.block_number,
      block.seal_id,
      'missing ZEUS in seal_quorum',
    );
  }
}

export function validateSealedBlockSequence(blocks: VaultSealedBlock[], startBlock: number): void {
  let expected = startBlock;
  for (const block of blocks) {
    validateSealedBlock(block, expected);
    expected++;
  }
}

/** Full-prime export: validate fields and monotonic order; gaps are warnings, not hard failures. */
export function validateSealedBlocksForExport(
  blocks: VaultSealedBlock[],
  opts: { incremental: boolean; startBlock: number },
): string[] {
  const warnings: string[] = [];

  for (const block of blocks) {
    validateSealedBlock(block);
  }

  if (blocks.length === 0) return warnings;

  if (opts.incremental) {
    validateSealedBlockSequence(blocks, opts.startBlock);
    return warnings;
  }

  if (blocks[0].block_number > opts.startBlock) {
    warnings.push(
      `first exported block is ${blocks[0].block_number} (blocks before ${blocks[0].block_number} are not attested in KV)`,
    );
  }

  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1].block_number;
    const curr = blocks[i].block_number;
    if (curr <= prev) {
      throw new SealedBlockValidationError(
        curr,
        blocks[i].seal_id,
        `non-monotonic block_number after ${prev}`,
      );
    }
    if (curr !== prev + 1) {
      warnings.push(`sequence gap: block ${prev} → ${curr}`);
    }
  }

  return warnings;
}
