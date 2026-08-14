import { verifyBoundaryContinuity } from '@/lib/watchdog/batchRepair/auditMetrics';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import type { Seal } from '@/lib/vault-v2/types';

export type LiveBoundary4142Assessment = {
  ok: boolean;
  status: 'pass' | 'fail' | 'absent';
  errors: string[];
  evidence_source: 'authenticated_primary_kv' | 'absent';
  canonical_block_41: string | null;
  canonical_block_42: string | null;
};

export function assessLiveBoundary4142(args: {
  manifest: CollisionRepairBatchManifest;
  live_seals: Seal[];
  clean_block_numbers: number[];
}): LiveBoundary4142Assessment {
  const errors: string[] = [];
  const canonical_block_41 = args.manifest.canonical_assignments['41'] ?? null;
  const canonical_block_42 = args.manifest.canonical_assignments['42'] ?? null;

  if (!canonical_block_41 || !canonical_block_42) {
    errors.push('canonical assignments for blocks 41 and 42 required for live boundary evidence');
    return {
      ok: false,
      status: 'absent',
      errors,
      evidence_source: 'absent',
      canonical_block_41,
      canonical_block_42,
    };
  }

  if (args.live_seals.length === 0) {
    errors.push('authenticated live seal bodies required for boundary 41->42 verification');
    return {
      ok: false,
      status: 'absent',
      errors,
      evidence_source: 'absent',
      canonical_block_41,
      canonical_block_42,
    };
  }

  const boundary = verifyBoundaryContinuity({
    seals: args.live_seals,
    canonical_assignments: args.manifest.canonical_assignments,
    clean_block_numbers: args.clean_block_numbers,
    from_block: 41,
    to_block: 42,
  });

  if (boundary !== 'pass') {
    errors.push('live boundary 41->42 continuity failed on authenticated primary KV seal bodies');
  }

  return {
    ok: boundary === 'pass',
    status: boundary,
    errors,
    evidence_source: 'authenticated_primary_kv',
    canonical_block_41,
    canonical_block_42,
  };
}
