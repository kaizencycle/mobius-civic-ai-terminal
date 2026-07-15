/**
 * C-373 collision repair prepare/commit — atomic derived-state transaction.
 */

import { Redis } from '@upstash/redis';
import { scheduleBackupMirrorPrefixedKey, scheduleBackupMirrorRawKey } from '@/lib/kv/backup-redis';
import { getUpstashRestCredentials } from '@/lib/kv/upstashEnv';
import {
  CAS_NULL_SENTINEL,
  LATEST_SEAL_KEY,
  compareAndSetLatestSealIdOnRedis,
} from '@/lib/vault-v2/latestSealCas';
import type { Seal } from '@/lib/vault-v2/types';
import { getLatestSealId } from '@/lib/vault-v2/store';
import {
  QUARANTINED_SEALS_KEY,
  getCanonicalSealForBlock,
  listQuarantinedSealIds,
} from '@/lib/watchdog/canonicalLineageIndex';
import { newestResolvedCanonicalSeal } from '@/lib/watchdog/canonicalLineageResolve';
import type { SealCollisionResolutionReceipt } from '@/lib/watchdog/reconciliationReceipt';

const MOBIUS_PREFIX = 'mobius:';

function blockKey(block_number: number): string {
  return `${MOBIUS_PREFIX}watchdog:canonical:block:${block_number}`;
}

function quarantineKey(): string {
  return `${MOBIUS_PREFIX}${QUARANTINED_SEALS_KEY}`;
}

export function quarantineWitness(ids: string[]): string {
  if (ids.length === 0) return CAS_NULL_SENTINEL;
  return JSON.stringify([...ids].sort());
}

export function mergeQuarantineIds(persisted: string[], incoming: string[]): string[] {
  const merged = [...persisted];
  for (const id of incoming) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged.sort();
}

export type PreparedCollisionRepair = {
  receipt_id: string;
  block_number: number;
  expected: {
    canonical_block: string | null;
    latest_pointer: string | null;
    quarantine_witness: string;
  };
  next: {
    canonical_block: string;
    quarantine_ids: string[];
    latest_pointer: string;
  };
  before: {
    canonical_block: string | null;
    quarantine: string[];
    latest_pointer: string | null;
  };
  already_applied: boolean;
};

function getTransactionRedis(): Redis | null {
  const creds = getUpstashRestCredentials();
  if (!creds) return null;
  try {
    return new Redis({ url: creds.url, token: creds.token });
  } catch {
    return null;
  }
}

export const COLLISION_REPAIR_TX_SCRIPT = `
local function is_null(s)
  return s == '${CAS_NULL_SENTINEL}'
end

local cur_block = redis.call('GET', KEYS[1])
if is_null(ARGV[1]) then
  if cur_block then return {0, 'canonical_block', cur_block} end
else
  if cur_block ~= ARGV[1] then return {0, 'canonical_block', cur_block or ''} end
end

local cur_quar = redis.call('GET', KEYS[2])
local cur_quar_str = cur_quar or '${CAS_NULL_SENTINEL}'
if ARGV[3] ~= cur_quar_str then return {0, 'quarantine', cur_quar_str} end

local cur_latest = redis.call('GET', KEYS[3])
if is_null(ARGV[5]) then
  if cur_latest then return {0, 'latest_pointer', cur_latest} end
else
  if cur_latest ~= ARGV[5] then return {0, 'latest_pointer', cur_latest or ''} end
end

redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[4])
redis.call('SET', KEYS[3], ARGV[6])
return {1, 'committed'}
`;

export type RepairTransactionResult =
  | { ok: true; status: 'committed' | 'already_applied' }
  | { ok: false; status: 'validation_failed' | 'rolled_back' | 'commit_failed'; failure_step: string; detail: string };

export async function prepareCollisionRepair(args: {
  receipt: SealCollisionResolutionReceipt;
  seals: Seal[];
}): Promise<{ ok: true; plan: PreparedCollisionRepair } | { ok: false; errors: string[] }> {
  const { receipt, seals } = args;
  const errors: string[] = [];

  const beforeCanonical = await getCanonicalSealForBlock(receipt.block_number);
  const beforeQuarantine = await listQuarantinedSealIds();
  const beforeLatest = await getLatestSealId();

  const nextQuarantine = mergeQuarantineIds(beforeQuarantine, receipt.conflicting_seal_ids);
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
    if (block_number === receipt.block_number) continue;
    canonicalIndex.set(block_number, await getCanonicalSealForBlock(block_number));
  }

  const pendingCanonical = new Map<number, string>([[receipt.block_number, receipt.canonical_seal_id]]);

  const { target, unresolved_blocks } = newestResolvedCanonicalSeal({
    seals,
    quarantined: effectiveQuarantine,
    canonicalIndex,
    pendingCanonical,
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
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const latestTarget = target!.seal_id;
  const already_applied =
    beforeCanonical === receipt.canonical_seal_id &&
    quarantineWitness(beforeQuarantine) === quarantineWitness(nextQuarantine) &&
    beforeLatest === latestTarget;

  const plan: PreparedCollisionRepair = {
    receipt_id: receipt.receipt_id,
    block_number: receipt.block_number,
    expected: {
      canonical_block: beforeCanonical,
      latest_pointer: beforeLatest,
      quarantine_witness: quarantineWitness(beforeQuarantine),
    },
    next: {
      canonical_block: receipt.canonical_seal_id,
      quarantine_ids: nextQuarantine,
      latest_pointer: latestTarget,
    },
    before: {
      canonical_block: beforeCanonical,
      quarantine: beforeQuarantine,
      latest_pointer: beforeLatest,
    },
    already_applied,
  };

  return { ok: true, plan };
}

export async function commitCollisionRepair(
  plan: PreparedCollisionRepair,
): Promise<RepairTransactionResult> {
  if (plan.already_applied) {
    return { ok: true, status: 'already_applied' };
  }

  const redis = getTransactionRedis();
  if (!redis) {
    return { ok: false, status: 'commit_failed', failure_step: 'redis', detail: 'Redis unavailable' };
  }

  const expectedBlock = plan.expected.canonical_block ?? CAS_NULL_SENTINEL;
  const expectedLatest = plan.expected.latest_pointer ?? CAS_NULL_SENTINEL;
  const nextQuarantineWitness = quarantineWitness(plan.next.quarantine_ids);

  const result = (await redis.eval(
    COLLISION_REPAIR_TX_SCRIPT,
    [blockKey(plan.block_number), quarantineKey(), LATEST_SEAL_KEY],
    [
      expectedBlock,
      plan.next.canonical_block,
      plan.expected.quarantine_witness,
      nextQuarantineWitness,
      expectedLatest,
      plan.next.latest_pointer,
    ],
  )) as [number, string, string?] | null;

  if (!result || !Array.isArray(result) || result[0] !== 1) {
    const failure_step = result?.[1] ?? 'unknown';
    const detail = result?.[2] ?? 'transaction precondition mismatch';
    return {
      ok: false,
      status: 'commit_failed',
      failure_step: String(failure_step),
      detail: String(detail),
    };
  }

  mirrorTransactionWrites(plan);
  return { ok: true, status: 'committed' };
}

function mirrorTransactionWrites(plan: PreparedCollisionRepair): void {
  scheduleBackupMirrorPrefixedKey(blockKey(plan.block_number), plan.next.canonical_block);
  scheduleBackupMirrorPrefixedKey(quarantineKey(), plan.next.quarantine_ids);
  scheduleBackupMirrorRawKey(LATEST_SEAL_KEY, plan.next.latest_pointer);
}

export async function rollbackCollisionRepair(
  plan: PreparedCollisionRepair,
): Promise<{ restored: boolean; failure_step?: string }> {
  const redis = getTransactionRedis();
  if (!redis) return { restored: false, failure_step: 'redis' };

  const blockRestored = await compareAndSetLatestSealIdOnRedis(
    redis,
    plan.next.latest_pointer,
    plan.before.latest_pointer ?? '',
  );
  // If latest was never written, CAS from next to before may fail — try direct restore paths

  try {
    const latestExpected = plan.before.latest_pointer;
    if (latestExpected === null) {
      await redis.del(LATEST_SEAL_KEY);
    } else {
      await redis.set(LATEST_SEAL_KEY, latestExpected);
      scheduleBackupMirrorRawKey(LATEST_SEAL_KEY, latestExpected);
    }

    const quarWitness =
      plan.before.quarantine.length === 0
        ? CAS_NULL_SENTINEL
        : JSON.stringify([...plan.before.quarantine].sort());
    const nextQuarWitness = JSON.stringify(plan.next.quarantine_ids);
    if (quarWitness === CAS_NULL_SENTINEL) {
      await redis.del(quarantineKey());
    } else {
      await redis.set(quarantineKey(), plan.before.quarantine);
      scheduleBackupMirrorPrefixedKey(quarantineKey(), plan.before.quarantine);
    }

    if (plan.before.canonical_block === null) {
      await redis.del(blockKey(plan.block_number));
    } else {
      await redis.set(blockKey(plan.block_number), plan.before.canonical_block);
      scheduleBackupMirrorPrefixedKey(blockKey(plan.block_number), plan.before.canonical_block);
    }

    void blockRestored;
    return { restored: true };
  } catch {
    return { restored: false, failure_step: 'rollback' };
  }
}
