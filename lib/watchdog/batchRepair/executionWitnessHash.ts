import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';

export const EXECUTION_WITNESS_SCHEMA_VERSION = '1.0' as const;

export type ExecutionWitnessRecordResult = {
  seal_id: string;
  status: 'MATCH' | 'MISMATCH' | 'MISSING' | 'UNEXPECTED';
  block_number: number | null;
  live_kv_hash: string | null;
  pinned_witness_hash: string | null;
};

export type ExecutionWitnessHashInput = {
  schema_version: typeof EXECUTION_WITNESS_SCHEMA_VERSION;
  semantic_manifest_hash: string;
  source_audit_hash: string;
  lineage_snapshot_hash: string;
  expected_seal_ids: string[];
  per_record_results: ExecutionWitnessRecordResult[];
  live_affected_block_numbers: number[];
  pinned_affected_block_numbers: number[];
  export_source: string;
  environment_identifier: string;
  production_kv_identity_receipt_hash: string | null;
  active_lineage_version: string | null;
  live_canonical_pointer: string | null;
};

export function buildExecutionWitnessHashPayload(
  input: ExecutionWitnessHashInput,
): Record<string, unknown> {
  return {
    schema_version: input.schema_version,
    semantic_manifest_hash: input.semantic_manifest_hash,
    source_audit_hash: input.source_audit_hash,
    lineage_snapshot_hash: input.lineage_snapshot_hash,
    expected_seal_ids: [...input.expected_seal_ids].sort(),
    per_record_results: [...input.per_record_results]
      .sort((a, b) => a.seal_id.localeCompare(b.seal_id))
      .map((record) => ({
        seal_id: record.seal_id,
        status: record.status,
        block_number: record.block_number,
        live_kv_hash: record.live_kv_hash,
        pinned_witness_hash: record.pinned_witness_hash,
      })),
    live_affected_block_numbers: [...input.live_affected_block_numbers].sort((a, b) => a - b),
    pinned_affected_block_numbers: [...input.pinned_affected_block_numbers].sort((a, b) => a - b),
    export_source: input.export_source,
    environment_identifier: input.environment_identifier,
    production_kv_identity_receipt_hash: input.production_kv_identity_receipt_hash,
    active_lineage_version: input.active_lineage_version,
    live_canonical_pointer: input.live_canonical_pointer,
  };
}

export function computeExecutionWitnessHash(input: ExecutionWitnessHashInput): string {
  return hashObject(buildExecutionWitnessHashPayload(input) as Record<string, unknown>);
}

/**
 * v2 execution-witness contract — see C-404 CAS-v2 repair. Binds explicitly
 * to `lineage_snapshot_version: 'v2'` and a v2 lineage snapshot hash so a
 * witness can never be silently paired with a lineage hash from the other
 * domain; existing witness/manifest evidence fields are unchanged from v1.
 */
export const EXECUTION_WITNESS_LINEAGE_SNAPSHOT_VERSION_V2 = 'v2' as const;

export type ExecutionWitnessHashInputV2 = Omit<ExecutionWitnessHashInput, 'lineage_snapshot_hash'> & {
  lineage_snapshot_version: typeof EXECUTION_WITNESS_LINEAGE_SNAPSHOT_VERSION_V2;
  /** Must be a hash produced by {@link computeLineageSnapshotHashV2}, not the v1 function. */
  lineage_snapshot_hash_v2: string;
};

export function buildExecutionWitnessHashPayloadV2(
  input: ExecutionWitnessHashInputV2,
): Record<string, unknown> {
  const { lineage_snapshot_hash_v2, lineage_snapshot_version, ...rest } = input;
  return {
    ...buildExecutionWitnessHashPayload({
      ...rest,
      lineage_snapshot_hash: lineage_snapshot_hash_v2,
    }),
    lineage_snapshot_version,
  };
}

export function computeExecutionWitnessHashV2(input: ExecutionWitnessHashInputV2): string {
  return hashObject(buildExecutionWitnessHashPayloadV2(input) as Record<string, unknown>);
}
