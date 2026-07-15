/**
 * C-373 guarded LATEST_SEAL_KEY (vault:seal:latest) repair.
 */

import type { Seal } from '@/lib/vault-v2/types';
import {
  compareAndSetLatestSealId,
  getLatestSeal,
  getLatestSealId,
  getSeal,
} from '@/lib/vault-v2/store';
import { isSealQuarantined, getCanonicalSealForBlock } from '@/lib/watchdog/canonicalLineageIndex';

export type LatestPointerRepairResult = {
  ok: boolean;
  action: 'repaired' | 'unchanged' | 'rejected';
  message: string;
  previous_pointer: string | null;
  new_pointer: string | null;
  target_seal_id: string | null;
};

export function newestValidCanonicalAttestedSeal(
  seals: Seal[],
  quarantined: Set<string>,
): Seal | null {
  const attested = seals.filter((s) => s.status === 'attested' && !quarantined.has(s.seal_id));
  if (attested.length === 0) return null;
  return attested.reduce((best, s) => (s.sealed_at > best.sealed_at ? s : best));
}

export async function resolveCanonicalSealForBlock(
  block_number: number,
  sealsAtBlock: Seal[],
  quarantined: Set<string>,
): Promise<Seal | null> {
  const indexed = await getCanonicalSealForBlock(block_number);
  if (indexed) {
    const seal = sealsAtBlock.find((s) => s.seal_id === indexed) ?? (await getSeal(indexed));
    if (seal && seal.status === 'attested' && !quarantined.has(seal.seal_id)) {
      return seal;
    }
  }
  const candidates = sealsAtBlock.filter((s) => s.status === 'attested' && !quarantined.has(s.seal_id));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return null;
}

export type LatestPointerRepairOptions = {
  seals: Seal[];
  quarantined: Set<string>;
  dryRun: boolean;
  expectedPreviousPointer?: string | null;
};

/**
 * Repair vault:seal:latest to the newest valid canonical attested seal.
 * Fails closed when target is missing, quarantined, or concurrent pointer change detected.
 */
export async function repairLatestSealPointer(
  options: LatestPointerRepairOptions,
): Promise<LatestPointerRepairResult> {
  const quarantined = options.quarantined;
  const target = newestValidCanonicalAttestedSeal(options.seals, quarantined);

  const previous_pointer = options.expectedPreviousPointer ?? (await getLatestSealId());

  if (!target) {
    return {
      ok: false,
      action: 'rejected',
      message: 'No valid canonical attested seal found for latest pointer repair',
      previous_pointer,
      new_pointer: null,
      target_seal_id: null,
    };
  }

  if (quarantined.has(target.seal_id)) {
    return {
      ok: false,
      action: 'rejected',
      message: `Target seal ${target.seal_id} is quarantined`,
      previous_pointer,
      new_pointer: null,
      target_seal_id: target.seal_id,
    };
  }

  if (await isSealQuarantined(target.seal_id)) {
    return {
      ok: false,
      action: 'rejected',
      message: `Target seal ${target.seal_id} is quarantined in canonical index`,
      previous_pointer,
      new_pointer: null,
      target_seal_id: target.seal_id,
    };
  }

  const pointed = await getLatestSeal();
  if (pointed && pointed.seal_id === target.seal_id) {
    return {
      ok: true,
      action: 'unchanged',
      message: 'LATEST_SEAL_KEY already points to canonical newest attested seal',
      previous_pointer,
      new_pointer: target.seal_id,
      target_seal_id: target.seal_id,
    };
  }

  const newer = options.seals.filter(
    (s) =>
      s.status === 'attested' &&
      !quarantined.has(s.seal_id) &&
      s.sealed_at > target.sealed_at &&
      s.seal_id !== target.seal_id,
  );
  if (newer.length > 0) {
    return {
      ok: false,
      action: 'rejected',
      message: `Newer canonical attested seal exists: ${newer[0].seal_id}`,
      previous_pointer,
      new_pointer: null,
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
