/**
 * C-373 operator collision repair — applies approved reconciliation receipts only.
 */

import type { Seal } from '@/lib/vault-v2/types';
import { getSeal, listAllSeals } from '@/lib/vault-v2/store';
import {
  commitCollisionRepair,
  prepareCollisionRepair,
} from '@/lib/watchdog/collisionRepairTransaction';
import { appendMutationJournal } from '@/lib/watchdog/mutationJournal';
import { repairLatestSealPointer } from '@/lib/watchdog/latestSealPointerRepair';
import {
  isReceiptApprovedForRepair,
  loadReceiptFromPathOrId,
  verifyKvSnapshotUnchanged,
  verifyReceiptHash,
  type SealCollisionResolutionReceipt,
} from '@/lib/watchdog/reconciliationReceipt';

export type CollisionRepairResult = {
  ok: boolean;
  dry_run: boolean;
  receipt_id: string;
  block_number: number;
  steps: Array<{ step: string; ok: boolean; detail: string }>;
  latest_pointer?: Awaited<ReturnType<typeof repairLatestSealPointer>>;
};

async function buildCurrentKvSnapshot(
  seal_ids: string[],
  seals: Seal[],
): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  const byId = new Map(seals.map((s) => [s.seal_id, s]));
  for (const seal_id of seal_ids) {
    const fromList = byId.get(seal_id);
    if (fromList) {
      snapshot[seal_id] = fromList.seal_hash;
      continue;
    }
    const seal = await getSeal(seal_id);
    if (seal) snapshot[seal_id] = seal.seal_hash;
  }
  return snapshot;
}

export async function validateReceiptForRepair(
  receipt: SealCollisionResolutionReceipt,
  seals: Seal[],
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!verifyReceiptHash(receipt)) {
    errors.push('receipt_hash verification failed (tampered receipt)');
  }
  if (!isReceiptApprovedForRepair(receipt)) {
    errors.push(
      'receipt not approved for repair (requires resolution_status=approved, human_approval=approved, and ZEUS+EVE for hash-divergent collisions)',
    );
  }

  const canonical = seals.find((s) => s.seal_id === receipt.canonical_seal_id);
  if (!canonical || canonical.status !== 'attested') {
    errors.push(`canonical seal missing or not attested: ${receipt.canonical_seal_id}`);
  }

  for (const conflicting_id of receipt.conflicting_seal_ids) {
    const conflicting = seals.find((s) => s.seal_id === conflicting_id);
    if (!conflicting) {
      errors.push(`conflicting seal missing from KV: ${conflicting_id}`);
    }
  }

  const currentSnapshot = await buildCurrentKvSnapshot(
    [receipt.canonical_seal_id, ...receipt.conflicting_seal_ids],
    seals,
  );
  const snapshotCheck = verifyKvSnapshotUnchanged(receipt, currentSnapshot);
  if (!snapshotCheck.ok) {
    errors.push(`KV state changed since audit (stale seal_ids: ${snapshotCheck.stale.join(', ')})`);
  }

  return { ok: errors.length === 0, errors };
}

export async function applyCollisionRepair(args: {
  receiptPathOrId: string;
  dryRun?: boolean;
  repairLatestPointer?: boolean;
  seals?: Seal[];
}): Promise<CollisionRepairResult> {
  const dry_run = args.dryRun !== false;
  const receipt = await loadReceiptFromPathOrId(args.receiptPathOrId);
  const seals = args.seals ?? (await listAllSeals(10_000));
  const steps: CollisionRepairResult['steps'] = [];

  const validation = await validateReceiptForRepair(receipt, seals);
  if (!validation.ok) {
    for (const err of validation.errors) {
      steps.push({ step: 'validate', ok: false, detail: err });
    }
    return {
      ok: false,
      dry_run,
      receipt_id: receipt.receipt_id,
      block_number: receipt.block_number,
      steps,
    };
  }
  steps.push({ step: 'validate', ok: true, detail: 'receipt approved and KV snapshot matches' });

  const prepared = await prepareCollisionRepair({ receipt, seals });
  if (!prepared.ok) {
    for (const err of prepared.errors) {
      steps.push({ step: 'prepare', ok: false, detail: err });
    }
    return {
      ok: false,
      dry_run,
      receipt_id: receipt.receipt_id,
      block_number: receipt.block_number,
      steps,
    };
  }

  const plan = prepared.plan;
  steps.push({
    step: 'prepare',
    ok: true,
    detail: plan.already_applied
      ? 'derived state already matches prepared plan (idempotent)'
      : `prepared transaction → latest ${plan.next.latest_pointer}, block ${plan.block_number} → ${plan.next.canonical_block}`,
  });

  if (dry_run) {
    steps.push({
      step: 'commit',
      ok: true,
      detail: `[dry-run] Would commit collision_repair_transaction atomically`,
    });
    const latest_pointer = await repairLatestSealPointer({
      seals,
      additionalQuarantineIds: receipt.conflicting_seal_ids,
      dryRun: true,
      expectedPreviousPointer: plan.before.latest_pointer,
      pendingCanonical: new Map([[receipt.block_number, receipt.canonical_seal_id]]),
    });
    steps.push({
      step: 'latest_pointer',
      ok: latest_pointer.ok,
      detail: latest_pointer.message,
    });
    return {
      ok: latest_pointer.ok,
      dry_run,
      receipt_id: receipt.receipt_id,
      block_number: receipt.block_number,
      steps,
      latest_pointer,
    };
  }

  const commit = await commitCollisionRepair(plan);
  if (!commit.ok) {
    steps.push({
      step: 'commit',
      ok: false,
      detail: `${commit.status} at ${commit.failure_step}: ${commit.detail}`,
    });
    await appendMutationJournal({
      at: new Date().toISOString(),
      operation: 'collision_repair_transaction',
      receipt_id: receipt.receipt_id,
      before: {
        status: 'rolled_back',
        failure_step: commit.failure_step,
        restored: false,
        before: plan.before,
      },
      after: plan.next,
    });
    return {
      ok: false,
      dry_run,
      receipt_id: receipt.receipt_id,
      block_number: receipt.block_number,
      steps,
    };
  }

  const txStatus = commit.status === 'already_applied' ? 'already_applied' : 'committed';
  steps.push({
    step: 'commit',
    ok: true,
    detail: `collision_repair_transaction ${txStatus}`,
  });

  await appendMutationJournal({
    at: new Date().toISOString(),
    operation: 'collision_repair_transaction',
    receipt_id: receipt.receipt_id,
    before: {
      status: txStatus,
      before: plan.before,
    },
    after: plan.next,
  });

  const latest_pointer =
    args.repairLatestPointer === false
      ? undefined
      : {
          ok: true,
          action: 'repaired' as const,
          message: `LATEST_SEAL_KEY set in transaction → ${plan.next.latest_pointer}`,
          previous_pointer: plan.before.latest_pointer,
          new_pointer: plan.next.latest_pointer,
          target_seal_id: plan.next.latest_pointer,
        };

  if (latest_pointer) {
    steps.push({
      step: 'latest_pointer',
      ok: true,
      detail: latest_pointer.message,
    });
  }

  return {
    ok: true,
    dry_run,
    receipt_id: receipt.receipt_id,
    block_number: receipt.block_number,
    steps,
    latest_pointer,
  };
}
