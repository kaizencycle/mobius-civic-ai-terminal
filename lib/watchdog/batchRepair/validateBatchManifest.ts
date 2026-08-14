import { verifyReceiptHash } from '@/lib/watchdog/reconciliationReceipt';
import {
  TRACK_R_CANONICAL_ASSIGNMENT_COUNT,
  TRACK_R_CLEAN_POSITION_COUNT,
  TRACK_R_CONTESTED_POSITIONS,
  TRACK_R_HISTORICAL_CONFLICT_PAIRS,
  TRACK_R_QUARANTINED_CONFLICTING_SEALS,
  TRACK_R_TOTAL_BLOCK_POSITIONS,
  type CollisionRepairBatchManifest,
} from '@/lib/watchdog/batchRepair/types';
import { verifyManifestHash } from '@/lib/watchdog/batchRepair/buildBatchManifest';
import type { CollisionResolutionTable } from '@/lib/watchdog/batchRepair/witnessResolution';

export type BatchValidationMode = 'dry_run' | 'commit';

export function validateBatchManifest(args: {
  manifest: CollisionRepairBatchManifest;
  resolutionTable: CollisionResolutionTable;
  mode?: BatchValidationMode;
  approved_manifest_hash?: string;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const manifest = args.manifest;
  const mode = args.mode ?? 'dry_run';

  if (!verifyManifestHash(manifest)) {
    errors.push('manifest_hash verification failed (tampered manifest)');
  }

  if (manifest.production_execution_enabled !== false) {
    errors.push('production_execution_enabled must be false');
  }

  if (manifest.total_block_positions !== TRACK_R_TOTAL_BLOCK_POSITIONS) {
    errors.push(`total_block_positions must be ${TRACK_R_TOTAL_BLOCK_POSITIONS}`);
  }
  if (manifest.contested_positions !== TRACK_R_CONTESTED_POSITIONS) {
    errors.push(`contested_positions must be ${TRACK_R_CONTESTED_POSITIONS}`);
  }
  if (manifest.historical_hash_divergent_pairs !== TRACK_R_HISTORICAL_CONFLICT_PAIRS) {
    errors.push(`historical_hash_divergent_pairs must be ${TRACK_R_HISTORICAL_CONFLICT_PAIRS}`);
  }
  if (manifest.quarantined_conflicting_seal_count !== TRACK_R_QUARANTINED_CONFLICTING_SEALS) {
    errors.push(`quarantined_conflicting_seal_count must be ${TRACK_R_QUARANTINED_CONFLICTING_SEALS}`);
  }
  if (manifest.canonical_assignment_count !== TRACK_R_CANONICAL_ASSIGNMENT_COUNT) {
    errors.push(`canonical_assignment_count must be ${TRACK_R_CANONICAL_ASSIGNMENT_COUNT}`);
  }
  if (manifest.clean_position_count !== TRACK_R_CLEAN_POSITION_COUNT) {
    errors.push(`clean_position_count must be ${TRACK_R_CLEAN_POSITION_COUNT}`);
  }

  if (manifest.receipts.length !== TRACK_R_CONTESTED_POSITIONS) {
    errors.push(`receipt count must be ${TRACK_R_CONTESTED_POSITIONS}, got ${manifest.receipts.length}`);
  }

  const receiptBlocks = new Set<number>();
  for (const receipt of manifest.receipts) {
    if (!verifyReceiptHash(receipt)) {
      errors.push(`receipt_hash invalid for ${receipt.receipt_id}`);
    }
    if (receiptBlocks.has(receipt.block_number)) {
      errors.push(`duplicate receipt for block ${receipt.block_number}`);
    }
    receiptBlocks.add(receipt.block_number);

    const tableCanon = args.resolutionTable.block_canonical[String(receipt.block_number)]?.seal_id;
    if (tableCanon !== receipt.canonical_seal_id) {
      errors.push(
        `block ${receipt.block_number}: canonical ${receipt.canonical_seal_id} differs from resolution table ${tableCanon}`,
      );
    }
    if (manifest.canonical_assignments[String(receipt.block_number)] !== receipt.canonical_seal_id) {
      errors.push(`block ${receipt.block_number}: manifest assignment mismatch`);
    }

    for (const conflicting_id of receipt.conflicting_seal_ids) {
      if (manifest.quarantined_seal_ids.includes(conflicting_id) === false) {
        errors.push(`conflicting seal ${conflicting_id} missing from quarantine list`);
      }
      if (conflicting_id === receipt.canonical_seal_id) {
        errors.push(`canonical seal ${receipt.canonical_seal_id} also listed as conflicting`);
      }
    }
  }

  const quarantineSet = new Set(manifest.quarantined_seal_ids);
  if (quarantineSet.size !== manifest.quarantined_seal_ids.length) {
    errors.push('duplicate quarantine seal ids');
  }
  if (quarantineSet.size !== TRACK_R_QUARANTINED_CONFLICTING_SEALS) {
    errors.push(`quarantine count must be ${TRACK_R_QUARANTINED_CONFLICTING_SEALS}`);
  }

  for (const canon of Object.values(manifest.canonical_assignments)) {
    if (quarantineSet.has(canon)) {
      errors.push(`canonical seal ${canon} also appears in quarantine set`);
    }
  }

  if (manifest.boundary_expectations['131->132'] !== 'pending_track_r_step_8') {
    errors.push('boundary 131->132 must remain pending_track_r_step_8');
  }

  if (mode === 'commit') {
    if (manifest.zeus_verdict !== 'approved') {
      errors.push('ZEUS verdict must be approved for commit mode');
    }
    if (manifest.eve_verdict !== 'approved') {
      errors.push('EVE verdict must be approved for commit mode');
    }
    if (manifest.human_approval !== 'approved') {
      errors.push('human approval must be approved for commit mode');
    }
    if (!args.approved_manifest_hash) {
      errors.push('approved_manifest_hash required for commit mode');
    } else if (args.approved_manifest_hash !== manifest.manifest_hash) {
      errors.push('approved_manifest_hash does not match executing manifest');
    }
  }

  return { ok: errors.length === 0, errors };
}
