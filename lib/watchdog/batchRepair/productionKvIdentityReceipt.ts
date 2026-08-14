import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';
import type { ProductionKvIdentityCheck } from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';
import { TRACK_R_PRODUCTION_KV_ANCHORS } from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';

export const PRODUCTION_KV_IDENTITY_RECEIPT_SCHEMA_VERSION = '1.0' as const;
export const PRODUCTION_KV_IDENTITY_READER = 'lib/watchdog/batchRepair/kvEnvironmentIdentity.ts';
export const PRODUCTION_KV_IDENTITY_READER_VERSION = 'C-403-handoff-v1';

export type ProductionApiCrossCheck = {
  fetched_at: string;
  base_url: string;
  latest_attested_seal: string | null;
  attested_seal_index: number | null;
  historical_collision_pairs: number | null;
  integrity_gate_active: boolean | null;
  collision_affected_blocks_present: boolean;
};

export type ProductionKvIdentityAnchorResult = {
  anchor: string;
  expected: string | number | boolean;
  observed: string | number | boolean | null;
  match: boolean;
  source: 'primary_kv' | 'production_api';
};

export type ProductionKvIdentityReceipt = {
  schema_version: typeof PRODUCTION_KV_IDENTITY_RECEIPT_SCHEMA_VERSION;
  environment_label: string;
  reader_implementation: string;
  reader_version: string;
  retrieved_at: string;
  anchor_results: ProductionKvIdentityAnchorResult[];
  api_cross_check: ProductionApiCrossCheck | null;
  identity_status: 'PRODUCTION_KV_IDENTITY_CONFIRMED' | 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH';
  identity_hash: string;
  errors: string[];
};

export type BuildProductionKvIdentityReceiptInput = {
  environment_label: string;
  retrieved_at: string;
  kv_identity: ProductionKvIdentityCheck;
  api_cross_check?: ProductionApiCrossCheck | null;
  expected_collision_pair_count?: number;
  expected_integrity_gate_active?: boolean;
};

function anchorResult(
  anchor: string,
  expected: string | number | boolean,
  observed: string | number | boolean | null,
  source: ProductionKvIdentityAnchorResult['source'],
): ProductionKvIdentityAnchorResult {
  return {
    anchor,
    expected,
    observed,
    match: observed === expected,
    source,
  };
}

export function buildProductionKvIdentityAnchorResults(args: {
  kv_identity: ProductionKvIdentityCheck;
  api_cross_check?: ProductionApiCrossCheck | null;
  expected_collision_pair_count?: number;
  expected_integrity_gate_active?: boolean;
}): ProductionKvIdentityAnchorResult[] {
  const anchors = TRACK_R_PRODUCTION_KV_ANCHORS;
  const results: ProductionKvIdentityAnchorResult[] = [
    anchorResult(
      'latest_seal_id',
      anchors.latest_seal_id,
      args.kv_identity.observed.latest_seal_id,
      'primary_kv',
    ),
    anchorResult(
      'latest_seal_hash',
      anchors.latest_seal_hash,
      args.kv_identity.observed.latest_seal_hash,
      'primary_kv',
    ),
    anchorResult(
      'attested_index_count',
      anchors.attested_index_count,
      args.kv_identity.observed.attested_index_count,
      'primary_kv',
    ),
    anchorResult(
      'audit_index_count',
      anchors.audit_index_count,
      args.kv_identity.observed.audit_index_count,
      'primary_kv',
    ),
    anchorResult(
      'probe_seal_found',
      true,
      args.kv_identity.observed.probe_seal_found,
      'primary_kv',
    ),
    anchorResult(
      'probe_seal_hash',
      anchors.latest_seal_hash,
      args.kv_identity.observed.probe_seal_hash,
      'primary_kv',
    ),
  ];

  const pairExpected = args.expected_collision_pair_count ?? anchors.collision_pair_count;
  const gateExpected = args.expected_integrity_gate_active ?? anchors.integrity_gate_active;

  if (args.api_cross_check) {
    results.push(
      anchorResult(
        'collision_pair_count',
        pairExpected,
        args.api_cross_check.historical_collision_pairs,
        'production_api',
      ),
      anchorResult(
        'integrity_gate_active',
        gateExpected,
        args.api_cross_check.integrity_gate_active,
        'production_api',
      ),
      anchorResult(
        'api_latest_attested_seal',
        anchors.latest_seal_id,
        args.api_cross_check.latest_attested_seal,
        'production_api',
      ),
      anchorResult(
        'api_attested_seal_index',
        anchors.attested_index_count,
        args.api_cross_check.attested_seal_index,
        'production_api',
      ),
    );
  }

  return results;
}

export function computeProductionKvIdentityHash(
  anchor_results: ProductionKvIdentityAnchorResult[],
): string {
  return hashObject({
    schema_version: PRODUCTION_KV_IDENTITY_RECEIPT_SCHEMA_VERSION,
    reader_implementation: PRODUCTION_KV_IDENTITY_READER,
    reader_version: PRODUCTION_KV_IDENTITY_READER_VERSION,
    anchor_results: [...anchor_results]
      .sort((a, b) => a.anchor.localeCompare(b.anchor))
      .map((row) => ({
        anchor: row.anchor,
        expected: row.expected,
        observed: row.observed,
        match: row.match,
        source: row.source,
      })),
  });
}

export function buildProductionKvIdentityReceipt(
  input: BuildProductionKvIdentityReceiptInput,
): ProductionKvIdentityReceipt {
  const anchor_results = buildProductionKvIdentityAnchorResults({
    kv_identity: input.kv_identity,
    api_cross_check: input.api_cross_check,
    expected_collision_pair_count: input.expected_collision_pair_count,
    expected_integrity_gate_active: input.expected_integrity_gate_active,
  });

  const anchor_mismatch = anchor_results.some((row) => !row.match);
  const kv_errors = input.kv_identity.errors;
  const errors = [...kv_errors];
  if (anchor_mismatch && kv_errors.length === 0) {
    errors.push('production KV/API anchor cross-check mismatch');
  }

  const identity_status =
    input.kv_identity.ok && !anchor_mismatch
      ? 'PRODUCTION_KV_IDENTITY_CONFIRMED'
      : 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH';

  return {
    schema_version: PRODUCTION_KV_IDENTITY_RECEIPT_SCHEMA_VERSION,
    environment_label: input.environment_label,
    reader_implementation: PRODUCTION_KV_IDENTITY_READER,
    reader_version: PRODUCTION_KV_IDENTITY_READER_VERSION,
    retrieved_at: input.retrieved_at,
    anchor_results,
    api_cross_check: input.api_cross_check ?? null,
    identity_status,
    identity_hash: computeProductionKvIdentityHash(anchor_results),
    errors,
  };
}
