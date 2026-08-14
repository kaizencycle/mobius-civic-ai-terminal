import {
  computeWitnessAuditHash,
  groupWitnessCollisions,
  type C397Witness,
} from '@/lib/watchdog/batchRepair/witnessResolution';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';

export type LiveSealWitnessRecordStatus = 'match' | 'mismatch' | 'missing';

export type LiveSealWitnessRecord = {
  seal_id: string;
  block_number: number | null;
  status: LiveSealWitnessRecordStatus;
  pinned_witness_hash: string | null;
  live_kv_hash: string | null;
};

export type LiveSealWitnessExport = {
  schema_version: '1.0';
  capture_id: string;
  exported_at: string;
  authenticated_read: true;
  export_source: string;
  /** Seal IDs that must appear in records with status match — from pinned witness universe. */
  expected_seal_ids: string[];
  records: LiveSealWitnessRecord[];
  summary: {
    total: number;
    match: number;
    mismatch: number;
    missing: number;
  };
  export_complete: boolean;
};

export type LiveSealWitnessVerification = {
  ok: boolean;
  errors: string[];
};

function summarizeRecords(records: LiveSealWitnessRecord[]): LiveSealWitnessExport['summary'] {
  let match = 0;
  let mismatch = 0;
  let missing = 0;
  for (const record of records) {
    switch (record.status) {
      case 'match':
        match += 1;
        break;
      case 'mismatch':
        mismatch += 1;
        break;
      case 'missing':
        missing += 1;
        break;
      default: {
        const _exhaustive: never = record.status;
        throw new Error(`unknown witness record status: ${String(_exhaustive)}`);
      }
    }
  }
  return { total: records.length, match, mismatch, missing };
}

/**
 * Execution-phase requirement: compare every Track R relevant live seal body against
 * the pinned witness. Collision count alone is insufficient for authorization.
 */
export function verifyLiveSealWitnessExport(
  witnessExport: LiveSealWitnessExport | null | undefined,
  args?: { expected_seal_ids?: string[] },
): LiveSealWitnessVerification {
  const errors: string[] = [];

  if (!witnessExport) {
    errors.push('authenticated live seal witness export required before execution');
    return { ok: false, errors };
  }

  if (witnessExport.authenticated_read !== true) {
    errors.push('live seal witness export must be authenticated_read');
  }
  if (!witnessExport.export_complete) {
    errors.push('live seal witness export incomplete — not all Track R seal bodies exported');
  }

  const authoritativeIds = args?.expected_seal_ids
    ? [...args.expected_seal_ids].sort()
    : null;
  const declaredIds = [...(witnessExport.expected_seal_ids ?? [])].sort();

  if (authoritativeIds) {
    if (declaredIds.length === 0) {
      errors.push('export must declare expected_seal_ids matching authoritative pinned witness universe');
    } else if (JSON.stringify(declaredIds) !== JSON.stringify(authoritativeIds)) {
      errors.push(
        `export expected_seal_ids (${declaredIds.length}) must match authoritative pinned witness universe (${authoritativeIds.length})`,
      );
    }
  }

  const expectedSealIds = authoritativeIds ?? declaredIds;
  if (expectedSealIds.length === 0) {
    errors.push('live seal witness export must declare expected_seal_ids with at least one seal');
  }

  const records = witnessExport.records ?? [];
  if (records.length === 0) {
    errors.push('live seal witness export must include per-record body evidence');
  }

  const computedSummary = summarizeRecords(records);
  const summary = witnessExport.summary;
  if (summary.total !== computedSummary.total) {
    errors.push('summary.total does not match records.length');
  }
  if (summary.match !== computedSummary.match) {
    errors.push('summary.match does not match records');
  }
  if (summary.mismatch !== computedSummary.mismatch) {
    errors.push('summary.mismatch does not match records');
  }
  if (summary.missing !== computedSummary.missing) {
    errors.push('summary.missing does not match records');
  }
  if (summary.total <= 0) {
    errors.push('live seal witness export summary.total must be greater than zero');
  }

  const recordById = new Map<string, LiveSealWitnessRecord>();
  for (const record of records) {
    if (!record.seal_id) {
      errors.push('witness record missing seal_id');
      continue;
    }
    if (recordById.has(record.seal_id)) {
      errors.push(`duplicate witness record for seal ${record.seal_id}`);
    }
    recordById.set(record.seal_id, record);

    switch (record.status) {
      case 'match':
        if (!record.pinned_witness_hash || !record.live_kv_hash) {
          errors.push(`match record ${record.seal_id} missing pinned or live hash`);
        } else if (record.pinned_witness_hash !== record.live_kv_hash) {
          errors.push(`match record ${record.seal_id} hash inequality`);
        }
        break;
      case 'mismatch':
        if (!record.pinned_witness_hash || !record.live_kv_hash) {
          errors.push(`mismatch record ${record.seal_id} missing pinned or live hash`);
        } else if (record.pinned_witness_hash === record.live_kv_hash) {
          errors.push(`mismatch record ${record.seal_id} hashes are equal`);
        }
        break;
      case 'missing':
        if (record.live_kv_hash) {
          errors.push(`missing record ${record.seal_id} must not include live_kv_hash`);
        }
        break;
      default: {
        const _exhaustive: never = record.status;
        errors.push(`unknown witness record status for ${record.seal_id}: ${String(_exhaustive)}`);
      }
    }
  }

  if (expectedSealIds.length > 0) {
    if (records.length !== expectedSealIds.length) {
      errors.push(
        `records.length (${records.length}) must equal expected_seal_ids.length (${expectedSealIds.length})`,
      );
    }
    for (const sealId of expectedSealIds) {
      const record = recordById.get(sealId);
      if (!record) {
        errors.push(`expected seal ${sealId} missing from export records`);
        continue;
      }
      if (record.status !== 'match') {
        errors.push(`expected seal ${sealId} must have status match, got ${record.status}`);
      }
    }
    for (const sealId of recordById.keys()) {
      if (!expectedSealIds.includes(sealId)) {
        errors.push(`unexpected seal ${sealId} in export records`);
      }
    }
  }

  if (summary.mismatch > 0) {
    errors.push(`live seal witness export has ${summary.mismatch} mismatches`);
  }
  if (summary.missing > 0) {
    errors.push(`live seal witness export has ${summary.missing} missing seals`);
  }

  return { ok: errors.length === 0, errors };
}

/** Build the expected seal ID universe from pinned witness collision groups. */
export function collectTrackRWitnessSealIds(witness: C397Witness): string[] {
  const ids = new Set<string>();
  for (const group of groupWitnessCollisions(witness)) {
    for (const candidate of group.candidate_seal_ids) {
      ids.add(candidate);
    }
  }
  return [...ids].sort();
}

/** Resolve authoritative witness seal universe for commit — must match manifest source_audit_hash. */
export function resolveRequiredWitnessSealIds(args: {
  witness: C397Witness;
  manifest: Pick<CollisionRepairBatchManifest, 'source_audit_hash'>;
}): { ok: true; seal_ids: string[] } | { ok: false; errors: string[] } {
  const witnessHash = computeWitnessAuditHash(args.witness);
  if (witnessHash !== args.manifest.source_audit_hash) {
    return {
      ok: false,
      errors: [
        `pinned witness audit hash ${witnessHash} does not match manifest source_audit_hash ${args.manifest.source_audit_hash}`,
      ],
    };
  }
  return { ok: true, seal_ids: collectTrackRWitnessSealIds(args.witness) };
}
