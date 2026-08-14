import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';

/** Lineage fields that gate compare-and-swap execution — excludes drifting telemetry. */
export type LineageSnapshotInput = {
  capture_id: string;
  cycle: string | null;
  latest_attested_seal: string | null;
  attested_seal_index: number | null;
  projected_next_sequence: number | null;
  historical_collision_pairs: number | null;
  contested_block_positions: number;
  uncontested_positions: number;
  canonical_reserve_blocks: unknown;
  integrity_gate_active: boolean | null;
  reserve_block_lane: string | null;
  candidate_formation_blocked: boolean | null;
  witness_audit_hash: string;
  resolution_table_hash: string;
  active_lineage_version: string | null;
  /** Live KV canonical pointer observation only — null when unresolved. Not a repair proposal. */
  live_canonical_pointer: string | null;
  pinned_affected_block_numbers_hash: string;
  live_affected_block_numbers_hash: string | null;
  affected_block_set_match: boolean;
};

/** Operational telemetry — informational only; must not gate CAS execution. */
export type TelemetrySnapshotInput = {
  capture_id: string;
  unsealed_accumulator_mic: number | null;
  gi_current: unknown;
  health_status: unknown;
  kv_available: boolean | null;
  latest_sealed_at: unknown;
};

export function computeLineageSnapshotHash(input: LineageSnapshotInput): string {
  return hashObject(input as unknown as Record<string, unknown>);
}

export function computeTelemetrySnapshotHash(input: TelemetrySnapshotInput): string {
  return hashObject(input as unknown as Record<string, unknown>);
}
