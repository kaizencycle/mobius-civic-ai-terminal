import { groupWitnessCollisions, type C397Witness } from '@/lib/watchdog/batchRepair/witnessResolution';

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

/**
 * Execution-phase requirement: compare every Track R relevant live seal body against
 * the pinned witness. Collision count alone is insufficient for authorization.
 */
export function verifyLiveSealWitnessExport(
  witnessExport: LiveSealWitnessExport | null | undefined,
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
  if (witnessExport.summary.mismatch > 0) {
    errors.push(`live seal witness export has ${witnessExport.summary.mismatch} mismatches`);
  }
  if (witnessExport.summary.missing > 0) {
    errors.push(`live seal witness export has ${witnessExport.summary.missing} missing seals`);
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
