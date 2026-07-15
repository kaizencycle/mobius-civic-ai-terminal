/**
 * C-373 operator collision repair — applies approved reconciliation receipts only.
 */

import type { Seal } from '@/lib/vault-v2/types';
import { getSeal, listAllSeals } from '@/lib/vault-v2/store';
import {
  appendQuarantinedSealIds,
  getCanonicalSealForBlock,
  setCanonicalSealForBlock,
} from '@/lib/watchdog/canonicalLineageIndex';
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

  const existingCanonical = await getCanonicalSealForBlock(receipt.block_number);
  if (existingCanonical === receipt.canonical_seal_id) {
    steps.push({
      step: 'canonical_block',
      ok: true,
      detail: `block ${receipt.block_number} already canonical → ${receipt.canonical_seal_id} (idempotent)`,
    });
  } else if (dry_run) {
    steps.push({
      step: 'canonical_block',
      ok: true,
      detail: `[dry-run] Would set block ${receipt.block_number} → ${receipt.canonical_seal_id}`,
    });
  } else {
    const prior = await setCanonicalSealForBlock(receipt.block_number, receipt.canonical_seal_id);
    await appendMutationJournal({
      at: new Date().toISOString(),
      operation: 'set_canonical_block',
      receipt_id: receipt.receipt_id,
      before: prior,
      after: receipt.canonical_seal_id,
    });
    steps.push({
      step: 'canonical_block',
      ok: true,
      detail: `block ${receipt.block_number} canonical index updated`,
    });
  }

  const quarantineIds = receipt.conflicting_seal_ids;
  if (dry_run) {
    steps.push({
      step: 'quarantine',
      ok: true,
      detail: `[dry-run] Would quarantine ${quarantineIds.length} conflicting seal(s)`,
    });
  } else {
    const priorQuarantine = await appendQuarantinedSealIds(quarantineIds);
    await appendMutationJournal({
      at: new Date().toISOString(),
      operation: 'quarantine_seal',
      receipt_id: receipt.receipt_id,
      before: priorQuarantine,
      after: quarantineIds,
    });
    steps.push({
      step: 'quarantine',
      ok: true,
      detail: `quarantined ${quarantineIds.length} conflicting seal(s) in derived index`,
    });
  }

  let latest_pointer: Awaited<ReturnType<typeof repairLatestSealPointer>> | undefined;
  if (args.repairLatestPointer !== false) {
    const quarantined = new Set([...quarantineIds]);
    latest_pointer = await repairLatestSealPointer({
      seals,
      quarantined,
      dryRun: dry_run,
    });
    steps.push({
      step: 'latest_pointer',
      ok: latest_pointer.ok,
      detail: latest_pointer.message,
    });
    if (!dry_run && latest_pointer.ok && latest_pointer.action === 'repaired') {
      await appendMutationJournal({
        at: new Date().toISOString(),
        operation: 'repair_latest_pointer',
        receipt_id: receipt.receipt_id,
        before: latest_pointer.previous_pointer,
        after: latest_pointer.new_pointer,
      });
    }
  }

  if (!dry_run) {
    await appendMutationJournal({
      at: new Date().toISOString(),
      operation: 'append_receipt',
      receipt_id: receipt.receipt_id,
      before: receipt.resolution_status,
      after: 'applied',
    });
    steps.push({
      step: 'receipt_status',
      ok: true,
      detail: 'application recorded in mutation journal (receipt remains append-only)',
    });
  }

  const ok =
    steps.every((s) => s.ok) &&
    (latest_pointer === undefined || latest_pointer.ok);

  return {
    ok,
    dry_run,
    receipt_id: receipt.receipt_id,
    block_number: receipt.block_number,
    steps,
    latest_pointer,
  };
}
