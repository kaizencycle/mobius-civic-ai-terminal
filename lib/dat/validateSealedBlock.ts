/**
 * Pre-export validation for Reserve Block .dat canonization.
 * EPICON: C-368 PR7 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import type { VaultSealedBlock } from './types';

const REQUIRED_QUORUM = SENTINEL_AGENTS.length;

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
  if (quorum.length !== REQUIRED_QUORUM) {
    throw new SealedBlockValidationError(
      block.block_number,
      block.seal_id,
      `seal_quorum must have ${REQUIRED_QUORUM} agents, got ${quorum.length}`,
    );
  }

  for (const agent of SENTINEL_AGENTS) {
    if (!quorum.includes(agent)) {
      throw new SealedBlockValidationError(
        block.block_number,
        block.seal_id,
        `missing sentinel ${agent} in seal_quorum`,
      );
    }
  }
}

export function validateSealedBlockSequence(blocks: VaultSealedBlock[], startBlock: number): void {
  let expected = startBlock;
  for (const block of blocks) {
    validateSealedBlock(block, expected);
    expected++;
  }
}
