import type { Seal } from '@/lib/vault-v2/types';
import { buildCollisionAuditReport } from '@/lib/watchdog/collisionAudit';
import {
  buildReceiptFromCollision,
  sealReceipt,
  type SealCollisionResolutionReceipt,
} from '@/lib/watchdog/reconciliationReceipt';
import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';
import {
  TRACK_R_BATCH_CYCLE,
  TRACK_R_BATCH_REPAIR_ID,
  TRACK_R_CANONICAL_ASSIGNMENT_COUNT,
  TRACK_R_CLEAN_POSITION_COUNT,
  TRACK_R_CONTESTED_POSITIONS,
  TRACK_R_HISTORICAL_CONFLICT_PAIRS,
  TRACK_R_QUARANTINED_CONFLICTING_SEALS,
  TRACK_R_STRATEGY,
  TRACK_R_TOTAL_BLOCK_POSITIONS,
  type CollisionRepairBatchManifest,
} from '@/lib/watchdog/batchRepair/types';
import {
  collectQuarantinedSealIds,
  computeResolutionTableHash,
  computeWitnessAuditHash,
  extractCanonicalAssignments,
  groupWitnessCollisions,
  type C397Witness,
  type CollisionResolutionTable,
} from '@/lib/watchdog/batchRepair/witnessResolution';

export function buildReceiptForContestedBlock(args: {
  witness: C397Witness;
  resolutionTable: CollisionResolutionTable;
  seals: Seal[];
  block_number: number;
  cycle: string;
  receipt_id: string;
  created_at: string;
}): SealCollisionResolutionReceipt {
  const canonical = args.resolutionTable.block_canonical[String(args.block_number)]?.seal_id;
  if (!canonical) {
    throw new Error(`block ${args.block_number} missing from resolution table`);
  }

  const audit = buildCollisionAuditReport(args.seals, {
    cycle: args.cycle,
    audited_at: args.created_at,
  });

  const proposed = buildReceiptFromCollision({
    audit,
    block_number: args.block_number,
    canonical_seal_id: canonical,
    canonical_reason: [
      `resolution_table:${args.resolutionTable.strategy}`,
      `substrate_cycle:${args.resolutionTable.cycle}`,
    ],
    evidence_refs: [
      'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json',
      'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json',
    ],
    receipt_id: args.receipt_id,
  });

  return sealReceipt({
    ...proposed,
    cycle: args.cycle,
    created_at: args.created_at,
    resolution_status: 'proposed',
    zeus_verdict: 'pending',
    eve_verdict: 'pending',
    human_approval: 'pending',
  });
}

export function buildBatchManifest(args: {
  witness: C397Witness;
  resolutionTable: CollisionResolutionTable;
  seals: Seal[];
  repair_id?: string;
  cycle?: string;
  created_at?: string;
}): CollisionRepairBatchManifest {
  const cycle = args.cycle ?? TRACK_R_BATCH_CYCLE;
  const repair_id = args.repair_id ?? TRACK_R_BATCH_REPAIR_ID;
  const created_at = args.created_at ?? '2026-08-14T00:00:00.000Z';

  if (args.resolutionTable.strategy !== TRACK_R_STRATEGY) {
    throw new Error(
      `resolution strategy must be ${TRACK_R_STRATEGY}, got ${args.resolutionTable.strategy}`,
    );
  }

  const canonical_assignments = extractCanonicalAssignments(args.resolutionTable);
  const quarantined_seal_ids = collectQuarantinedSealIds({
    witness: args.witness,
    canonicalAssignments: canonical_assignments,
  });

  const groups = groupWitnessCollisions(args.witness);
  const receipts: SealCollisionResolutionReceipt[] = groups.map((group) =>
    buildReceiptForContestedBlock({
      witness: args.witness,
      resolutionTable: args.resolutionTable,
      seals: args.seals,
      block_number: group.block_number,
      cycle,
      receipt_id: `rcpt-${cycle}-b${String(group.block_number).padStart(3, '0')}-batch`,
      created_at,
    }),
  );

  const body: Omit<CollisionRepairBatchManifest, 'manifest_hash'> = {
    schema_version: '1.0',
    repair_id,
    cycle,
    strategy: TRACK_R_STRATEGY,
    source_audit_hash: computeWitnessAuditHash(args.witness),
    resolution_table_hash: computeResolutionTableHash(args.resolutionTable),
    total_block_positions: TRACK_R_TOTAL_BLOCK_POSITIONS,
    contested_positions: TRACK_R_CONTESTED_POSITIONS,
    historical_hash_divergent_pairs: TRACK_R_HISTORICAL_CONFLICT_PAIRS,
    canonical_assignment_count: TRACK_R_CANONICAL_ASSIGNMENT_COUNT,
    quarantined_conflicting_seal_count: TRACK_R_QUARANTINED_CONFLICTING_SEALS,
    clean_position_count: TRACK_R_CLEAN_POSITION_COUNT,
    receipts,
    canonical_assignments,
    quarantined_seal_ids,
    boundary_expectations: {
      '41->42': 'must_pass',
      '131->132': 'pending_track_r_step_8',
    },
    production_execution_enabled: false,
    zeus_verdict: 'pending',
    eve_verdict: 'pending',
    human_approval: 'pending',
    created_at,
  };

  const manifest_hash = hashObject(body as unknown as Record<string, unknown>);
  return { ...body, manifest_hash };
}

export function verifyManifestHash(manifest: CollisionRepairBatchManifest): boolean {
  const { manifest_hash, ...body } = manifest;
  return hashObject(body as unknown as Record<string, unknown>) === manifest_hash;
}
