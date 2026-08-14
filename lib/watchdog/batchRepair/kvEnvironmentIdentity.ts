import type { Seal } from '@/lib/vault-v2/types';
import type { PrimarySealBatchRead, PrimarySealReadResult } from '@/lib/vault-v2/store';
import {
  getLatestSealIdPrimaryOnly,
  getSealsByIdsPrimaryOnly,
  listAllSealIdsPrimaryOnly,
  listSealIdsPrimaryOnly,
} from '@/lib/vault-v2/store';

/** Production anchors observed at 2026-08-14T18:49 UTC via /api/vault/status + KV. */
export const TRACK_R_PRODUCTION_KV_ANCHORS = {
  latest_seal_id: 'seal-C-372-002',
  latest_seal_hash: 'e19e9e44b32503a77b0c646b91a6780ffe9c42eafc3dad29e7758619b7500ef5',
  attested_index_count: 360,
  audit_index_count: 360,
  probe_seal_id: 'seal-C-372-002',
  collision_pair_count: 125,
  integrity_gate_active: true,
} as const;

export type ProductionKvAnchorInput = {
  latest_seal_id: string;
  latest_seal_hash: string;
  attested_index_count: number;
  audit_index_count: number;
  probe_seal_id: string;
  collision_pair_count: number;
  integrity_gate_active: boolean;
};

export type ProductionKvIdentityCheck = {
  ok: boolean;
  blocked_reason: 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH' | null;
  errors: string[];
  observed: {
    latest_seal_id: string | null;
    latest_seal_hash: string | null;
    attested_index_count: number;
    audit_index_count: number;
    probe_seal_found: boolean;
    probe_seal_hash: string | null;
  };
};

export function verifyProductionKvIdentityAgainstAnchors(args: {
  anchors: ProductionKvAnchorInput;
  observed: ProductionKvIdentityCheck['observed'];
}): ProductionKvIdentityCheck {
  const errors: string[] = [];

  if (args.observed.latest_seal_id !== args.anchors.latest_seal_id) {
    errors.push(
      `latest seal id mismatch: expected ${args.anchors.latest_seal_id}, observed ${args.observed.latest_seal_id ?? 'null'}`,
    );
  }
  if (args.observed.latest_seal_hash !== args.anchors.latest_seal_hash) {
    errors.push(
      `latest seal hash mismatch: expected ${args.anchors.latest_seal_hash}, observed ${args.observed.latest_seal_hash ?? 'null'}`,
    );
  }
  if (args.observed.attested_index_count !== args.anchors.attested_index_count) {
    errors.push(
      `attested index count mismatch: expected ${args.anchors.attested_index_count}, observed ${args.observed.attested_index_count}`,
    );
  }
  if (args.observed.audit_index_count !== args.anchors.audit_index_count) {
    errors.push(
      `audit index count mismatch: expected ${args.anchors.audit_index_count}, observed ${args.observed.audit_index_count}`,
    );
  }
  if (!args.observed.probe_seal_found) {
    errors.push(`probe seal ${args.anchors.probe_seal_id} not found in primary KV`);
  } else if (args.observed.probe_seal_hash !== args.anchors.latest_seal_hash) {
    errors.push(
      `probe seal hash mismatch: expected ${args.anchors.latest_seal_hash}, observed ${args.observed.probe_seal_hash ?? 'null'}`,
    );
  }

  return {
    ok: errors.length === 0,
    blocked_reason: errors.length > 0 ? 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH' : null,
    errors,
    observed: args.observed,
  };
}

export async function verifyProductionKvEnvironmentIdentity(args?: {
  anchors?: ProductionKvAnchorInput;
}): Promise<ProductionKvIdentityCheck> {
  const anchors = args?.anchors ?? TRACK_R_PRODUCTION_KV_ANCHORS;

  const [latestSealId, attestedIds, auditIds, probeBatch] = await Promise.all([
    getLatestSealIdPrimaryOnly(),
    listSealIdsPrimaryOnly(),
    listAllSealIdsPrimaryOnly(),
    getSealsByIdsPrimaryOnly([anchors.probe_seal_id]),
  ]);

  const identityTransportErrors = [...probeBatch.chunk_errors];
  const probeRead = probeBatch.reads[0];
  const probeSeal = probeRead?.provenance === 'primary' ? probeRead.seal : null;

  const observed: ProductionKvIdentityCheck['observed'] = {
    latest_seal_id: latestSealId,
    latest_seal_hash: probeSeal?.seal_id === anchors.latest_seal_id ? probeSeal.seal_hash : null,
    attested_index_count: attestedIds.length,
    audit_index_count: auditIds.length,
    probe_seal_found: probeSeal != null && identityTransportErrors.length === 0,
    probe_seal_hash: probeSeal?.seal_hash ?? null,
  };

  if (latestSealId && latestSealId !== anchors.probe_seal_id) {
    const latestBatch = await getSealsByIdsPrimaryOnly([latestSealId]);
    identityTransportErrors.push(...latestBatch.chunk_errors);
    const latestSeal =
      latestBatch.reads[0]?.provenance === 'primary' ? latestBatch.reads[0].seal : null;
    if (latestSeal) {
      observed.latest_seal_hash = latestSeal.seal_hash;
    }
  }

  const check = verifyProductionKvIdentityAgainstAnchors({ anchors, observed });
  if (identityTransportErrors.length > 0) {
    return {
      ...check,
      ok: false,
      blocked_reason: 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH',
      errors: [...identityTransportErrors, ...check.errors],
    };
  }

  return check;
}

export function validateCompletePrimarySealReads(args: {
  expected_ids: readonly string[];
  batch: PrimarySealBatchRead;
}): { ok: boolean; errors: string[]; seals: Seal[] } {
  const errors = [...args.batch.chunk_errors];
  const readById = new Map(args.batch.reads.map((read) => [read.seal_id, read]));
  let missing_count = 0;

  for (const seal_id of args.expected_ids) {
    const read = readById.get(seal_id);
    if (!read || read.provenance !== 'primary' || read.seal == null) {
      missing_count += 1;
    }
  }

  if (missing_count > 0) {
    errors.push(
      `primary KV incomplete seal hydration: ${missing_count}/${args.expected_ids.length} indexed bodies missing from primary Upstash`,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors, seals: [] };
  }

  return {
    ok: true,
    errors: [],
    seals: liveSealsFromPrimaryReads(args.batch.reads),
  };
}

export function liveSealsFromPrimaryReads(reads: PrimarySealReadResult[]): Seal[] {
  return reads
    .filter((read) => read.provenance === 'primary' && read.seal != null)
    .map((read) => read.seal as Seal);
}
