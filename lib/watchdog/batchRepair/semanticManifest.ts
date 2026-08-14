import type { SealCollisionResolutionReceipt } from '@/lib/watchdog/reconciliationReceipt';
import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';

/** Receipt fields that define repair semantics — excludes attestation and capture telemetry. */
export type SemanticReceiptPayload = {
  block_number: number;
  canonical_seal_id: string;
  conflicting_seal_ids: string[];
  canonical_reason: string[];
  evidence_refs: string[];
  original_hashes: Record<string, string>;
};

export function extractSemanticReceiptPayload(
  receipt: SealCollisionResolutionReceipt,
): SemanticReceiptPayload {
  return {
    block_number: receipt.block_number,
    canonical_seal_id: receipt.canonical_seal_id,
    conflicting_seal_ids: [...receipt.conflicting_seal_ids].sort(),
    canonical_reason: [...receipt.canonical_reason],
    evidence_refs: [...receipt.evidence_refs],
    original_hashes: { ...receipt.original_hashes },
  };
}

/**
 * Deterministic manifest payload for governance attestation.
 * Excludes created_at, verdicts, kv_snapshot, receipt hashes, and other volatile telemetry.
 */
export function computeSemanticManifestPayload(
  manifest: Omit<CollisionRepairBatchManifest, 'manifest_hash'>,
): Record<string, unknown> {
  const receipts = [...manifest.receipts]
    .sort((a, b) => a.block_number - b.block_number)
    .map(extractSemanticReceiptPayload);

  return {
    schema_version: manifest.schema_version,
    repair_id: manifest.repair_id,
    cycle: manifest.cycle,
    strategy: manifest.strategy,
    source_audit_hash: manifest.source_audit_hash,
    resolution_table_hash: manifest.resolution_table_hash,
    total_block_positions: manifest.total_block_positions,
    contested_positions: manifest.contested_positions,
    historical_hash_divergent_pairs: manifest.historical_hash_divergent_pairs,
    canonical_assignment_count: manifest.canonical_assignment_count,
    quarantined_conflicting_seal_count: manifest.quarantined_conflicting_seal_count,
    clean_position_count: manifest.clean_position_count,
    canonical_assignments: manifest.canonical_assignments,
    quarantined_seal_ids: [...manifest.quarantined_seal_ids].sort(),
    boundary_expectations: manifest.boundary_expectations,
    governance_disposition: manifest.governance_disposition,
    receipts,
  };
}

export function computeManifestHash(
  manifest: Omit<CollisionRepairBatchManifest, 'manifest_hash'>,
): string {
  return hashObject(computeSemanticManifestPayload(manifest) as Record<string, unknown>);
}

export function verifyManifestHash(manifest: CollisionRepairBatchManifest): boolean {
  const { manifest_hash, ...body } = manifest;
  return computeManifestHash(body) === manifest_hash;
}
