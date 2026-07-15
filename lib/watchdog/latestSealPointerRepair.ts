/**
 * C-373 guarded LATEST_SEAL_KEY (vault:seal:latest) repair.
 */

import type { Seal } from '@/lib/vault-v2/types';
import { compareAndSetLatestSealId, getLatestSealId, getSeal } from '@/lib/vault-v2/store';
import {
  getCanonicalSealForBlock,
  listQuarantinedSealIds,
} from '@/lib/watchdog/canonicalLineageIndex';
import {
  type CanonicalIndexSnapshot,
  newestResolvedCanonicalSeal,
  resolveBlockCanonicalSeal,
} from '@/lib/watchdog/canonicalLineageResolve';

export type LatestPointerRepairResult = {
  ok: boolean;
  action: 'repaired' | 'unchanged' | 'rejected';
  message: string;
  previous_pointer: string | null;
  new_pointer: string | null;
  target_seal_id: string | null;
  unresolved_blocks?: number[];
};

export async function loadCanonicalIndexForSeals(seals: Seal[]): Promise<CanonicalIndexSnapshot> {
  const index: CanonicalIndexSnapshot = new Map();
  const blocks = new Set(seals.filter((s) => s.status === 'attested').map((s) => s.sequence));
  await Promise.all(
    [...blocks].map(async (block_number) => {
      index.set(block_number, await getCanonicalSealForBlock(block_number));
    }),
  );
  return index;
}

export async function loadEffectiveQuarantine(extraIds: string[] = []): Promise<Set<string>> {
  const persisted = await listQuarantinedSealIds();
  return new Set([...persisted, ...extraIds]);
}

export type LatestPointerRepairOptions = {
  seals: Seal[];
  /** Unioned with persisted quarantine index before candidate selection. */
  additionalQuarantineIds?: string[];
  dryRun: boolean;
  expectedPreviousPointer?: string | null;
  pendingCanonical?: Map<number, string>;
  /** Test hook: skip KV reads for quarantine/index */
  persistedQuarantine?: string[];
  canonicalIndex?: CanonicalIndexSnapshot;
};

/**
 * Repair vault:seal:latest to the newest resolved canonical attested seal.
 * Fails closed when lineage is unresolved or target fails canonical proof.
 */
export async function repairLatestSealPointer(
  options: LatestPointerRepairOptions,
): Promise<LatestPointerRepairResult> {
  const previous_pointer = options.expectedPreviousPointer ?? (await getLatestSealId());

  const quarantined =
    options.persistedQuarantine !== undefined
      ? new Set([...options.persistedQuarantine, ...(options.additionalQuarantineIds ?? [])])
      : await loadEffectiveQuarantine(options.additionalQuarantineIds ?? []);

  const canonicalIndex =
    options.canonicalIndex ?? (await loadCanonicalIndexForSeals(options.seals));

  const { target, unresolved_blocks } = newestResolvedCanonicalSeal({
    seals: options.seals,
    quarantined,
    canonicalIndex,
    pendingCanonical: options.pendingCanonical,
  });

  if (unresolved_blocks.length > 0) {
    return {
      ok: false,
      action: 'rejected',
      message: `Unresolved collision blocks: ${unresolved_blocks.join(', ')}`,
      previous_pointer,
      new_pointer: null,
      target_seal_id: null,
      unresolved_blocks,
    };
  }

  if (!target) {
    return {
      ok: false,
      action: 'rejected',
      message: 'No resolved canonical attested seal found for latest pointer repair',
      previous_pointer,
      new_pointer: null,
      target_seal_id: null,
    };
  }

  if (previous_pointer === target.seal_id) {
    return {
      ok: true,
      action: 'unchanged',
      message: 'LATEST_SEAL_KEY already points to resolved canonical newest attested seal',
      previous_pointer,
      new_pointer: target.seal_id,
      target_seal_id: target.seal_id,
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      action: 'repaired',
      message: `[dry-run] Would set LATEST_SEAL_KEY → ${target.seal_id}`,
      previous_pointer,
      new_pointer: target.seal_id,
      target_seal_id: target.seal_id,
    };
  }

  const cas = await compareAndSetLatestSealId(previous_pointer, target.seal_id);
  if (!cas.ok) {
    return {
      ok: false,
      action: 'rejected',
      message: `Concurrent LATEST_SEAL_KEY change detected (expected ${previous_pointer ?? 'null'}, actual ${cas.actual ?? 'null'})`,
      previous_pointer,
      new_pointer: cas.actual,
      target_seal_id: target.seal_id,
    };
  }

  return {
    ok: true,
    action: 'repaired',
    message: `LATEST_SEAL_KEY repaired → ${target.seal_id}`,
    previous_pointer,
    new_pointer: target.seal_id,
    target_seal_id: target.seal_id,
  };
}

/** @deprecated Use newestResolvedCanonicalSeal — retained for test migration */
export { resolveBlockCanonicalSeal, newestResolvedCanonicalSeal };
