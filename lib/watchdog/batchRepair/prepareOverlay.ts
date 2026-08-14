import type { Seal } from '@/lib/vault-v2/types';
import { mergeQuarantineIds } from '@/lib/watchdog/collisionRepairTransaction';
import { newestResolvedCanonicalSeal } from '@/lib/watchdog/canonicalLineageResolve';
import type { SealCollisionResolutionReceipt } from '@/lib/watchdog/reconciliationReceipt';

/**
 * In-memory overlay matching prepareCollisionRepair semantics with batch pendingCanonical.
 * Does not read production KV.
 */
export function prepareCollisionRepairOverlay(args: {
  receipt: SealCollisionResolutionReceipt;
  seals: Seal[];
  persistedCanonical: Map<number, string | null>;
  persistedQuarantine: string[];
  pendingCanonical: Map<number, string>;
}): { ok: boolean; errors: string[] } {
  const { receipt, seals } = args;
  const errors: string[] = [];

  const nextQuarantine = mergeQuarantineIds(args.persistedQuarantine, receipt.conflicting_seal_ids);
  const effectiveQuarantine = new Set(nextQuarantine);

  const canonicalIndex = new Map<number, string | null>();
  const byBlock = new Map<number, Seal[]>();
  for (const seal of seals) {
    if (seal.status !== 'attested') continue;
    const group = byBlock.get(seal.sequence) ?? [];
    group.push(seal);
    byBlock.set(seal.sequence, group);
  }

  for (const block_number of byBlock.keys()) {
    if (args.pendingCanonical.has(block_number)) continue;
    if (block_number === receipt.block_number) continue;
    canonicalIndex.set(block_number, args.persistedCanonical.get(block_number) ?? null);
  }

  const { target, unresolved_blocks } = newestResolvedCanonicalSeal({
    seals,
    quarantined: effectiveQuarantine,
    canonicalIndex,
    pendingCanonical: args.pendingCanonical,
  });

  if (unresolved_blocks.length > 0) {
    errors.push(`unresolved collision blocks: ${unresolved_blocks.join(', ')}`);
  }
  if (!target) {
    errors.push('no resolved canonical latest seal target after proposed quarantine');
  }

  const canonicalSeal = seals.find((s) => s.seal_id === receipt.canonical_seal_id);
  if (!canonicalSeal || canonicalSeal.status !== 'attested') {
    errors.push(`canonical seal missing or not attested: ${receipt.canonical_seal_id}`);
  } else if (canonicalSeal.sequence !== receipt.block_number) {
    errors.push(
      `canonical seal ${receipt.canonical_seal_id} sequence ${canonicalSeal.sequence} does not match receipt block ${receipt.block_number}`,
    );
  }

  return { ok: errors.length === 0, errors };
}
