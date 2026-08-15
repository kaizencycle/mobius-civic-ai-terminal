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

/**
 * v2 lineage snapshot domain — see C-404 CAS-v2 repair.
 *
 * v1 ({@link LineageSnapshotInput}) bound `capture_id` and the operator `cycle`
 * label into the hash. Both fields describe the evidence envelope, not
 * production lineage, so two captures of an *identical* production state
 * produced different v1 hashes whenever the capture ID or cycle label
 * changed — a structural false-positive CAS drift, not a real change in
 * lineage. See docs/epicon/cycles/C-404/TRACK_R_LINEAGE_CAS_V2.md.
 *
 * v2 removes both fields from the hashed payload; the domain tag below is
 * itself part of the hashed payload so a v1 digest can never collide with a
 * v2 digest, and so a hash cannot be silently reinterpreted as belonging to
 * the other version.
 */
export const LINEAGE_SNAPSHOT_DOMAIN_V2 = 'mobius.track-r.lineage-snapshot.v2' as const;

/**
 * Lineage fields that gate compare-and-swap execution under the v2 domain —
 * production-lineage fields only. `capture_id` and `cycle` are intentionally
 * absent: they identify the evidence envelope (which capture produced this
 * reading, under which operator cycle label), not production state, and
 * moving them out of the hash is the entire point of v2. They still belong
 * in the surrounding evidence/telemetry envelope (e.g. execution-witness
 * `export_source`/`environment_identifier`, capture package metadata) —
 * just not inside the CAS-gating hash itself.
 *
 * Every remaining field below represents production lineage state, not
 * evidence-envelope or telemetry metadata:
 *  - latest_attested_seal / attested_seal_index: identity of the production
 *    seal chain tip and its length — the core CAS anchor.
 *  - projected_next_sequence: the block position the next seal would occupy;
 *    a real property of chain state, not of how it was observed.
 *  - historical_collision_pairs: count of historically hash-divergent seal
 *    pairs in the production reserve — a property of the ledger, not the
 *    reading.
 *  - contested_block_positions / uncontested_positions: partition of the
 *    reserve block positions into contested vs. clean — production state.
 *  - canonical_reserve_blocks: the canonical reserve block set itself.
 *  - integrity_gate_active: whether the production integrity gate is
 *    currently engaged — a live execution precondition.
 *  - reserve_block_lane: which reserve lane production is currently on.
 *  - candidate_formation_blocked: whether candidate formation is currently
 *    blocked in production — an execution precondition, not telemetry.
 *  - witness_audit_hash / resolution_table_hash: hashes of the pinned
 *    witness universe and resolution table this capture is checked against
 *    — fixed inputs to the CAS comparison, not envelope metadata.
 *  - active_lineage_version / live_canonical_pointer: the production
 *    lineage pointer state itself.
 *  - pinned_affected_block_numbers_hash / live_affected_block_numbers_hash /
 *    affected_block_set_match: the pinned vs. live affected-block-set
 *    comparison outcome — core CAS material, not incidental to the read.
 */
export type LineageSnapshotV2Input = {
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

/**
 * Fields deliberately excluded from {@link LineageSnapshotV2Input} versus v1,
 * kept here only as a compile-time cross-check against drift in the type
 * above (see the `_excludedFromV2` assertion in snapshotIdentity.test.ts —
 * consumers should never import this type for hashing).
 */
export type LineageSnapshotV1OnlyFields = Pick<LineageSnapshotInput, 'capture_id' | 'cycle'>;

export function computeLineageSnapshotHashV2(input: LineageSnapshotV2Input): string {
  return hashObject({
    schema_domain: LINEAGE_SNAPSHOT_DOMAIN_V2,
    ...input,
  } as unknown as Record<string, unknown>);
}
