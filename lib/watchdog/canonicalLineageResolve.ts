/**
 * C-373 canonical lineage resolution — pure, fail-closed candidate selection.
 */

import type { Seal } from '@/lib/vault-v2/types';

export type CanonicalIndexSnapshot = Map<number, string | null>;

export function groupAttestedByBlock(seals: Seal[]): Map<number, Seal[]> {
  const byBlock = new Map<number, Seal[]>();
  for (const seal of seals) {
    if (seal.status !== 'attested') continue;
    const group = byBlock.get(seal.sequence) ?? [];
    group.push(seal);
    byBlock.set(seal.sequence, group);
  }
  return byBlock;
}

export function resolveBlockCanonicalSeal(
  block_number: number,
  sealsAtBlock: Seal[],
  quarantined: Set<string>,
  indexedSealId: string | null | undefined,
): { seal: Seal | null; unresolved: boolean; reason?: string } {
  const attested = sealsAtBlock.filter((s) => s.status === 'attested');
  const nonQuarantined = attested.filter((s) => !quarantined.has(s.seal_id));

  if (nonQuarantined.length === 0) {
    return { seal: null, unresolved: false };
  }

  if (attested.length === 1 && nonQuarantined.length === 1) {
    if (nonQuarantined[0].sequence !== block_number) {
      return {
        seal: null,
        unresolved: true,
        reason: `block ${block_number}: seal ${nonQuarantined[0].seal_id} has sequence ${nonQuarantined[0].sequence}`,
      };
    }
    return { seal: nonQuarantined[0], unresolved: false };
  }

  if (!indexedSealId) {
    return { seal: null, unresolved: true, reason: `block ${block_number}: missing canonical index` };
  }

  const indexed = attested.find((s) => s.seal_id === indexedSealId);
  if (!indexed) {
    return {
      seal: null,
      unresolved: true,
      reason: `block ${block_number}: canonical index points to missing seal ${indexedSealId}`,
    };
  }
  if (indexed.status !== 'attested') {
    return {
      seal: null,
      unresolved: true,
      reason: `block ${block_number}: canonical index points to non-attested seal ${indexedSealId}`,
    };
  }
  if (indexed.sequence !== block_number) {
    return {
      seal: null,
      unresolved: true,
      reason: `block ${block_number}: canonical index seal ${indexedSealId} belongs to block ${indexed.sequence}`,
    };
  }
  if (quarantined.has(indexed.seal_id)) {
    return {
      seal: null,
      unresolved: true,
      reason: `block ${block_number}: canonical index points to quarantined seal ${indexedSealId}`,
    };
  }

  return { seal: indexed, unresolved: false };
}

export function resolveCanonicalLineageCandidates(args: {
  seals: Seal[];
  quarantined: Set<string>;
  canonicalIndex: CanonicalIndexSnapshot;
  pendingCanonical?: Map<number, string>;
}): { candidates: Seal[]; unresolved_blocks: number[] } {
  const byBlock = groupAttestedByBlock(args.seals);
  const candidates: Seal[] = [];
  const unresolved_blocks: number[] = [];

  for (const [block_number, group] of byBlock) {
    const indexed = args.pendingCanonical?.has(block_number)
      ? args.pendingCanonical.get(block_number)!
      : (args.canonicalIndex.get(block_number) ?? null);

    const result = resolveBlockCanonicalSeal(block_number, group, args.quarantined, indexed);
    if (result.unresolved) {
      unresolved_blocks.push(block_number);
      continue;
    }
    if (result.seal) {
      candidates.push(result.seal);
    }
  }

  return { candidates, unresolved_blocks };
}

export function newestResolvedCanonicalSeal(args: {
  seals: Seal[];
  quarantined: Set<string>;
  canonicalIndex: CanonicalIndexSnapshot;
  pendingCanonical?: Map<number, string>;
}): { target: Seal | null; unresolved_blocks: number[] } {
  const { candidates, unresolved_blocks } = resolveCanonicalLineageCandidates(args);
  if (unresolved_blocks.length > 0) {
    return { target: null, unresolved_blocks };
  }
  if (candidates.length === 0) {
    return { target: null, unresolved_blocks: [] };
  }
  const target = candidates.reduce((best, seal) => (seal.sealed_at > best.sealed_at ? seal : best));
  return { target, unresolved_blocks: [] };
}
