/**
 * Detect duplicate block_number collisions in attested Reserve Block seals.
 * EPICON: C-370 | reserve-canon integrity audit
 */

import type { Seal } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { sealToVaultBlock, type VaultSealedBlock } from '@/lib/dat/types';

export interface BlockCollision {
  block_number: number;
  kept_seal_id: string;
  dropped_seal_id: string;
  kept_cycle: string;
  dropped_cycle: string;
  kept_quorum: number;
  dropped_quorum: number;
  kept_sealed_at: string;
  dropped_sealed_at: string;
  seal_hashes_differ: boolean;
}

export interface ReserveBlockCollisionReport {
  raw_attested_count: number;
  unique_block_count: number;
  collision_count: number;
  collisions: BlockCollision[];
  /** True when collision rate exceeds configured alert threshold. */
  alert: boolean;
  alert_threshold: number;
}

const DEFAULT_ALERT_THRESHOLD = 0;

export function quorumCount(seal: Seal): number {
  return SENTINEL_AGENTS.filter((agent) => seal.attestations?.[agent]?.signature).length;
}

export function pickPreferredSeal(a: Seal, b: Seal): Seal {
  const aQuorum = quorumCount(a);
  const bQuorum = quorumCount(b);
  if (bQuorum !== aQuorum) return bQuorum > aQuorum ? b : a;
  if (b.sealed_at !== a.sealed_at) return b.sealed_at > a.sealed_at ? b : a;
  return b.seal_id > a.seal_id ? b : a;
}

export function pickPreferredBlock(a: VaultSealedBlock, b: VaultSealedBlock): VaultSealedBlock {
  const aQuorum = a.quorum?.length ?? 0;
  const bQuorum = b.quorum?.length ?? 0;
  if (bQuorum !== aQuorum) return bQuorum > aQuorum ? b : a;
  if (b.sealed_at !== a.sealed_at) return b.sealed_at > a.sealed_at ? b : a;
  return b.seal_id > a.seal_id ? b : a;
}

export function analyzeReserveBlockCollisions(
  seals: Seal[],
  options?: { alertThreshold?: number },
): ReserveBlockCollisionReport {
  const alertThreshold = options?.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;
  const attested = seals.filter((s) => s.status === 'attested');
  const byNumber = new Map<number, Seal[]>();

  for (const seal of attested) {
    const group = byNumber.get(seal.sequence) ?? [];
    group.push(seal);
    byNumber.set(seal.sequence, group);
  }

  const collisions: BlockCollision[] = [];

  for (const [blockNumber, group] of byNumber) {
    if (group.length < 2) continue;
    let kept = group[0];
    for (let i = 1; i < group.length; i++) {
      const challenger = group[i];
      const winner = pickPreferredSeal(kept, challenger);
      const loser = winner === kept ? challenger : kept;
      collisions.push({
        block_number: blockNumber,
        kept_seal_id: winner.seal_id,
        dropped_seal_id: loser.seal_id,
        kept_cycle: winner.cycle_at_seal,
        dropped_cycle: loser.cycle_at_seal,
        kept_quorum: quorumCount(winner),
        dropped_quorum: quorumCount(loser),
        kept_sealed_at: winner.sealed_at,
        dropped_sealed_at: loser.sealed_at,
        seal_hashes_differ: winner.seal_hash !== loser.seal_hash,
      });
      kept = winner;
    }
  }

  collisions.sort((a, b) => a.block_number - b.block_number || a.dropped_seal_id.localeCompare(b.dropped_seal_id));

  const uniqueBlockCount = byNumber.size;
  const collisionCount = collisions.length;

  return {
    raw_attested_count: attested.length,
    unique_block_count: uniqueBlockCount,
    collision_count: collisionCount,
    collisions,
    alert: collisionCount > alertThreshold,
    alert_threshold: alertThreshold,
  };
}

export function dedupeBlocksByNumber(
  blocks: VaultSealedBlock[],
  verbose: boolean,
): VaultSealedBlock[] {
  const byNumber = new Map<number, VaultSealedBlock>();
  for (const block of blocks) {
    const existing = byNumber.get(block.block_number);
    if (!existing) {
      byNumber.set(block.block_number, block);
      continue;
    }
    const kept = pickPreferredBlock(existing, block);
    const dropped = kept === existing ? block : existing;
    if (verbose) {
      console.warn(
        `[fetchAllSealedBlocks] duplicate block_number ${block.block_number}: kept ${kept.seal_id}, dropped ${dropped.seal_id}`,
      );
    }
    byNumber.set(block.block_number, kept);
  }
  return [...byNumber.values()].sort((a, b) => a.block_number - b.block_number);
}

export function sealsToUniqueBlocks(seals: Seal[]): VaultSealedBlock[] {
  const attested = seals.filter((s) => s.status === 'attested').map(sealToVaultBlock);
  return dedupeBlocksByNumber(attested, false);
}
