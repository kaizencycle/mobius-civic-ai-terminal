import {
  resolveCanonicalSealIdForBlock,
  verifyBoundaryContinuity,
} from '@/lib/watchdog/batchRepair/auditMetrics';
import { liveSealsFromPrimaryReads } from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import {
  getSealsByIdsPrimaryOnly,
  listAllSealIdsPrimaryOnly,
} from '@/lib/vault-v2/store';
import type { Seal } from '@/lib/vault-v2/types';

export type LiveBoundary4142Assessment = {
  ok: boolean;
  status: 'pass' | 'fail' | 'absent';
  errors: string[];
  evidence_source: 'authenticated_primary_kv' | 'absent';
  canonical_block_41: string | null;
  canonical_block_42: string | null;
};

export const LIVE_BOUNDARY_41_42_BLOCKS = [41, 42] as const;

async function findSingleAttestedSealAtBlockPrimaryOnly(
  block_number: number,
): Promise<Seal | null> {
  const allIds = await listAllSealIdsPrimaryOnly();
  if (allIds.length === 0) return null;

  const primaryReads = await getSealsByIdsPrimaryOnly(allIds);
  const seals = liveSealsFromPrimaryReads(primaryReads);
  const atBlock = seals.filter(
    (seal) => seal.sequence === block_number && seal.status === 'attested',
  );
  if (atBlock.length === 1) return atBlock[0];
  return null;
}

/** Augment witness export seals with primary-only bodies required for 41→42 continuity. */
export async function loadLiveSealsForBoundary4142(args: {
  manifest: CollisionRepairBatchManifest;
  witness_live_seals: Seal[];
  clean_block_numbers: number[];
  kv_identity_ok: boolean;
}): Promise<{
  seals: Seal[];
  block_41_id: string | null;
  block_42_id: string | null;
  errors: string[];
}> {
  const errors: string[] = [];
  const byId = new Map(args.witness_live_seals.map((seal) => [seal.seal_id, seal]));

  if (!args.kv_identity_ok) {
    errors.push('production KV identity must pass before loading live boundary 41->42 seals');
    return {
      seals: args.witness_live_seals,
      block_41_id: null,
      block_42_id: args.manifest.canonical_assignments['42'] ?? null,
      errors,
    };
  }

  let block_41_id = resolveCanonicalSealIdForBlock({
    block_number: 41,
    canonical_assignments: args.manifest.canonical_assignments,
    seals: args.witness_live_seals,
    clean_block_numbers: args.clean_block_numbers,
  });

  if (!block_41_id && args.clean_block_numbers.includes(41)) {
    const block41Seal = await findSingleAttestedSealAtBlockPrimaryOnly(41);
    if (block41Seal) {
      block_41_id = block41Seal.seal_id;
      byId.set(block41Seal.seal_id, block41Seal);
    } else {
      errors.push('single attested primary KV seal required at clean block 41');
    }
  }

  let block_42_id = resolveCanonicalSealIdForBlock({
    block_number: 42,
    canonical_assignments: args.manifest.canonical_assignments,
    seals: args.witness_live_seals,
    clean_block_numbers: args.clean_block_numbers,
  });

  if (!block_42_id) {
    block_42_id = args.manifest.canonical_assignments['42'] ?? null;
  }

  if (!block_42_id) {
    errors.push('block 42 canonical seal id required for live boundary evidence');
  } else if (!byId.has(block_42_id)) {
    const reads = await getSealsByIdsPrimaryOnly([block_42_id]);
    const supplemental = liveSealsFromPrimaryReads(reads)[0] ?? null;
    if (supplemental) {
      byId.set(supplemental.seal_id, supplemental);
    } else {
      errors.push(`block 42 canonical seal ${block_42_id} missing from primary KV`);
    }
  }

  return {
    seals: [...byId.values()],
    block_41_id,
    block_42_id,
    errors,
  };
}

export function assessLiveBoundary4142(args: {
  manifest: CollisionRepairBatchManifest;
  live_seals: Seal[];
  clean_block_numbers: number[];
  resolved_block_41_id?: string | null;
  resolved_block_42_id?: string | null;
  preload_errors?: string[];
}): LiveBoundary4142Assessment {
  const errors = [...(args.preload_errors ?? [])];
  const canonical_block_41 =
    args.resolved_block_41_id ??
    resolveCanonicalSealIdForBlock({
      block_number: 41,
      canonical_assignments: args.manifest.canonical_assignments,
      seals: args.live_seals,
      clean_block_numbers: args.clean_block_numbers,
    });
  const canonical_block_42 =
    args.resolved_block_42_id ??
    resolveCanonicalSealIdForBlock({
      block_number: 42,
      canonical_assignments: args.manifest.canonical_assignments,
      seals: args.live_seals,
      clean_block_numbers: args.clean_block_numbers,
    });

  if (!canonical_block_42) {
    errors.push('block 42 canonical seal id required for live boundary evidence');
  }
  if (!canonical_block_41 && args.clean_block_numbers.includes(41)) {
    errors.push('block 41 attested seal body required for live boundary evidence (clean position)');
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

  if (errors.length > 0) {
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
