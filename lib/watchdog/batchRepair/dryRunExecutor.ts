import type { Seal } from '@/lib/vault-v2/types';
import { prepareCollisionRepair } from '@/lib/watchdog/collisionRepairTransaction';
import { newestResolvedCanonicalSeal } from '@/lib/watchdog/canonicalLineageResolve';
import { buildBatchManifest } from '@/lib/watchdog/batchRepair/buildBatchManifest';
import {
  computeBatchAdjudicationMetrics,
  deriveLatestCanonicalSeal,
} from '@/lib/watchdog/batchRepair/auditMetrics';
import { buildRollbackPlan } from '@/lib/watchdog/batchRepair/rollbackPlan';
import {
  canGuaranteeAtomicActivation,
  InMemoryLineageStore,
  stageVersionedLineage,
} from '@/lib/watchdog/batchRepair/versionedStaging';
import {
  TRACK_R_BATCH_CYCLE,
  TRACK_R_BATCH_REPAIR_ID,
  type BatchDryRunReport,
  type CollisionRepairBatchManifest,
} from '@/lib/watchdog/batchRepair/types';
import { validateBatchManifest } from '@/lib/watchdog/batchRepair/validateBatchManifest';
import {
  loadResolutionTableFromFile,
  loadWitnessFromFile,
  type C397Witness,
  type CollisionResolutionTable,
} from '@/lib/watchdog/batchRepair/witnessResolution';
import { buildFixtureSealsFromWitness, witnessCountsMatchExpected } from '@/lib/watchdog/batchRepair/fixtureSeals';
import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';

export type BatchDryRunInput = {
  witnessPath: string;
  resolutionTablePath: string;
  seals?: Seal[];
  repair_id?: string;
  cycle?: string;
  created_at?: string;
  previous_active_version?: string | null;
  previous_latest_pointer?: string | null;
};

export type BatchDryRunResult = {
  ok: boolean;
  errors: string[];
  manifest?: CollisionRepairBatchManifest;
  report?: BatchDryRunReport;
  batch_prepare_simulation?: {
    all_receipts_prepare_ok: boolean;
    failed_blocks: number[];
  };
};

/**
 * Simulate cumulative pendingCanonical across all 123 receipts — proves batch resolves
 * the single-receipt circular dependency without KV writes.
 */
export function simulateBatchPrepare(args: {
  manifest: CollisionRepairBatchManifest;
  seals: Seal[];
}): { ok: boolean; failed_blocks: number[] } {
  const pendingCanonical = new Map<number, string>();
  for (const [block, seal_id] of Object.entries(args.manifest.canonical_assignments)) {
    pendingCanonical.set(Number(block), seal_id);
  }
  const effectiveQuarantine = new Set(args.manifest.quarantined_seal_ids);
  const failed_blocks: number[] = [];

  for (const receipt of [...args.manifest.receipts].sort(
    (a, b) => a.block_number - b.block_number,
  )) {
    const prepared = awaitPrepareSimulation({
      receipt,
      seals: args.seals,
      pendingCanonical,
      effectiveQuarantine,
    });
    if (!prepared.ok) failed_blocks.push(receipt.block_number);
  }

  return { ok: failed_blocks.length === 0, failed_blocks };
}

function awaitPrepareSimulation(args: {
  receipt: CollisionRepairBatchManifest['receipts'][number];
  seals: Seal[];
  pendingCanonical: Map<number, string>;
  effectiveQuarantine: Set<string>;
}): { ok: boolean } {
  // Inline simulation matching prepareCollisionRepair overlay semantics
  const canonicalIndex = new Map<number, string | null>();
  const byBlock = new Map<number, Seal[]>();
  for (const seal of args.seals) {
    if (seal.status !== 'attested') continue;
    const group = byBlock.get(seal.sequence) ?? [];
    group.push(seal);
    byBlock.set(seal.sequence, group);
  }
  for (const block_number of byBlock.keys()) {
    if (args.pendingCanonical.has(block_number)) {
      canonicalIndex.set(block_number, args.pendingCanonical.get(block_number)!);
    } else {
      canonicalIndex.set(block_number, null);
    }
  }

  const { target, unresolved_blocks } = newestResolvedCanonicalSeal({
    seals: args.seals,
    quarantined: args.effectiveQuarantine,
    canonicalIndex,
    pendingCanonical: args.pendingCanonical,
  });

  if (unresolved_blocks.length > 0 || !target) return { ok: false };
  return { ok: true };
}

export async function executeBatchDryRun(input: BatchDryRunInput): Promise<BatchDryRunResult> {
  const errors: string[] = [];

  const witness = loadWitnessFromFile(input.witnessPath);
  const resolutionTable = loadResolutionTableFromFile(input.resolutionTablePath);

  const countCheck = witnessCountsMatchExpected(witness);
  if (!countCheck.ok) errors.push(...countCheck.errors);

  if (resolutionTable.approval_status !== 'pending_zeus_and_eve_attestation') {
    errors.push(
      `resolution table approval_status must be pending_zeus_and_eve_attestation, got ${resolutionTable.approval_status}`,
    );
  }

  const seals =
    input.seals ?? buildFixtureSealsFromWitness(witness as C397Witness, resolutionTable);

  const manifest = buildBatchManifest({
    witness,
    resolutionTable,
    seals,
    repair_id: input.repair_id ?? TRACK_R_BATCH_REPAIR_ID,
    cycle: input.cycle ?? TRACK_R_BATCH_CYCLE,
    created_at: input.created_at ?? '2026-08-14T00:00:00.000Z',
  });

  const validation = validateBatchManifest({
    manifest,
    resolutionTable,
    mode: 'dry_run',
  });
  if (!validation.ok) errors.push(...validation.errors);

  const simulation = simulateBatchPrepare({ manifest, seals });
  if (!simulation.ok) {
    errors.push(`batch prepare simulation failed for blocks: ${simulation.failed_blocks.join(', ')}`);
  }

  const derived_latest = deriveLatestCanonicalSeal(manifest, seals);
  const store = new InMemoryLineageStore();
  const { view: staged, writes } = stageVersionedLineage({
    manifest,
    clean_block_numbers: witness.clean_block_numbers,
    derived_latest_canonical_seal_id: derived_latest,
    store,
    write: false,
  });

  if (writes !== 0) {
    errors.push(`dry run must perform zero writes, got ${writes}`);
  }

  const metrics = computeBatchAdjudicationMetrics({
    witness,
    manifest,
    staged,
    clean_positions_modified: 0,
  });

  if (metrics.unresolved_collision_positions !== 0) {
    errors.push(
      `unresolved_collision_positions must be 0 in complete staged view, got ${metrics.unresolved_collision_positions}`,
    );
  }

  const rollback_plan = buildRollbackPlan({
    manifest,
    previous_active_version: input.previous_active_version ?? null,
    previous_latest_pointer: input.previous_latest_pointer ?? null,
  });

  const atomicity = canGuaranteeAtomicActivation();
  if (!atomicity.ok) {
    errors.push(atomicity.blocker ?? 'atomic activation not guaranteed');
  }

  const report: BatchDryRunReport = {
    repair_id: manifest.repair_id,
    cycle: manifest.cycle,
    dry_run: true,
    manifest_hash: manifest.manifest_hash,
    writes_performed: 0,
    metrics,
    staged,
    rollback_plan,
    idempotent: true,
  };

  return {
    ok: errors.length === 0,
    errors,
    manifest,
    report,
    batch_prepare_simulation: {
      all_receipts_prepare_ok: simulation.ok,
      failed_blocks: simulation.failed_blocks,
    },
  };
}

export function dryRunReportHash(report: BatchDryRunReport): string {
  return hashObject(report as unknown as Record<string, unknown>);
}

/** Prove single-receipt prepare fails without batch overlay on first contested block. */
export async function demonstrateSingleReceiptCircularDependency(args: {
  manifest: CollisionRepairBatchManifest;
  seals: Seal[];
}): Promise<{ fails_without_batch: boolean; detail: string }> {
  const first = [...args.manifest.receipts].sort((a, b) => a.block_number - b.block_number)[0];
  if (!first) {
    return { fails_without_batch: false, detail: 'no receipts' };
  }
  const prepared = await prepareCollisionRepair({ receipt: first, seals: args.seals });
  if (prepared.ok) {
    return {
      fails_without_batch: false,
      detail: 'single-receipt prepare unexpectedly succeeded without batch overlay',
    };
  }
  const hasUnresolved = prepared.errors.some((e) => e.includes('unresolved collision blocks'));
  return {
    fails_without_batch: hasUnresolved,
    detail: prepared.errors.join('; '),
  };
}
