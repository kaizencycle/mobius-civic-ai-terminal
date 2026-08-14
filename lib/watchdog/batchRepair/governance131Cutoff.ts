import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import type { ExecutionWitnessRecordResult } from '@/lib/watchdog/batchRepair/executionWitnessHash';
import { verifyBoundaryContinuity } from '@/lib/watchdog/batchRepair/auditMetrics';
import type { Seal } from '@/lib/vault-v2/types';

export type Governance131CutoffAssessment = {
  ok: boolean;
  status: 'pass' | 'clarify' | 'quarantine';
  errors: string[];
  promoted_through_position: number;
  proposed_latest_canonical_seal_id: string;
  boundary_131_132: 'pending_track_r_step_8' | 'pass' | 'fail';
  positions_132_194_status: 'verified_unattached';
};

export function assessGovernance131Cutoff(args: {
  manifest: CollisionRepairBatchManifest;
  live_witness_records: ExecutionWitnessRecordResult[];
  seals_for_boundary_check: Seal[];
  clean_block_numbers: number[];
}): Governance131CutoffAssessment {
  const errors: string[] = [];
  const disposition = args.manifest.governance_disposition;

  if (disposition.promoted_canonical_through_position !== 131) {
    errors.push('governance must promote only through position 131');
  }
  if (disposition.preserved_unattached.status !== 'verified_unattached') {
    errors.push('positions 132-194 must remain verified_unattached');
  }
  if (disposition.boundary_131_132_edge !== 'not_fabricated') {
    errors.push('131->132 edge must not be fabricated');
  }

  const block131Canonical = args.manifest.canonical_assignments['131'];
  if (block131Canonical !== disposition.proposed_latest_canonical_seal_id) {
    errors.push('block 131 canonical assignment must match proposed_latest_canonical_seal_id');
  }

  const seal131Record = args.live_witness_records.find(
    (record) => record.seal_id === disposition.proposed_latest_canonical_seal_id,
  );
  if (seal131Record && seal131Record.status !== 'MATCH') {
    errors.push(
      `proposed latest canonical ${disposition.proposed_latest_canonical_seal_id} lacks live MATCH evidence`,
    );
  }

  const boundary = verifyBoundaryContinuity({
    seals: args.seals_for_boundary_check,
    canonical_assignments: args.manifest.canonical_assignments,
    clean_block_numbers: args.clean_block_numbers,
    from_block: 131,
    to_block: 132,
  });

  if (boundary === 'pass') {
    errors.push('131->132 boundary must not pass — no fabricated edge permitted');
  }

  const status: Governance131CutoffAssessment['status'] =
    errors.length === 0 ? 'pass' : boundary === 'fail' ? 'clarify' : 'quarantine';

  return {
    ok: errors.length === 0,
    status,
    errors,
    promoted_through_position: disposition.promoted_canonical_through_position,
    proposed_latest_canonical_seal_id: disposition.proposed_latest_canonical_seal_id,
    boundary_131_132: boundary === 'pass' ? 'pass' : 'pending_track_r_step_8',
    positions_132_194_status: 'verified_unattached',
  };
}
