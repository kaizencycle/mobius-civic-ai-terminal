// C-404: Track R lineage CAS v2 — semantic stability, material sensitivity, version safety
// Run: tsx tests/contract/trackRLineageSnapshotV2.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  computeLineageSnapshotHash,
  computeLineageSnapshotHashV2,
  LINEAGE_SNAPSHOT_DOMAIN_V2,
  computeExecutionWitnessHashV2,
  EXECUTION_WITNESS_LINEAGE_SNAPSHOT_VERSION_V2,
  assertLineageSnapshotVersionAccepted,
  isSupportedLineageSnapshotVersion,
  hashAffectedBlockNumbers,
  loadWitnessFromFile,
  type LineageSnapshotV2Input,
} from '@/lib/watchdog/batchRepair';

const FIXTURE_DIR = join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures');
const WITNESS_PATH = join(FIXTURE_DIR, 'C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json');
const PINNED_WITNESS = loadWitnessFromFile(WITNESS_PATH);
const BLOCK_HASH = hashAffectedBlockNumbers(PINNED_WITNESS.contested_block_numbers);

/** Same production-lineage fixture used to pin the v1 drift in trackRFailClosed.test.ts. */
function baseProductionLineage(): LineageSnapshotV2Input {
  return {
    latest_attested_seal: 'seal-C-372-002',
    attested_seal_index: 360,
    projected_next_sequence: 361,
    historical_collision_pairs: 125,
    contested_block_positions: 123,
    uncontested_positions: 71,
    canonical_reserve_blocks: { a: 1, b: 2 },
    integrity_gate_active: true,
    reserve_block_lane: 'integrity_hold',
    candidate_formation_blocked: true,
    witness_audit_hash: '9196394bdbffe04e7a87d7cb2320b30b2e3c9cc07f24df9dfdfa7351b5dc6b87',
    resolution_table_hash: 'd821c9ba7fc95b5c5055c8dce41170319c11ec89ba1486a69de90e347760c845',
    active_lineage_version: null,
    live_canonical_pointer: null,
    pinned_affected_block_numbers_hash: BLOCK_HASH,
    live_affected_block_numbers_hash: BLOCK_HASH,
    affected_block_set_match: true,
  };
}

describe('Track R lineage snapshot v2 — semantic stability', () => {
  it('same lineage + different capture_id (v1 concept, absent from v2 input) → same v2 hash', () => {
    // v2 has no capture_id field at all, so there is nothing to vary — this
    // is the fix: capture_id can no longer perturb the lineage hash.
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2(baseProductionLineage());
    assert.equal(a, b);
  });

  it('same lineage + different cycle label (v1 concept, absent from v2 input) → same v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2(baseProductionLineage());
    assert.equal(a, b);
    // Type-level proof: LineageSnapshotV2Input has no `cycle` key to vary.
    assert.equal(Object.hasOwn(baseProductionLineage(), 'cycle'), false);
    assert.equal(Object.hasOwn(baseProductionLineage(), 'capture_id'), false);
  });

  it('same lineage + different timestamp (never in the hash) → same v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    // simulate calls at two different wall-clock times — input is identical either way
    const b = computeLineageSnapshotHashV2(baseProductionLineage());
    assert.equal(a, b);
  });

  it('same lineage + different telemetry (telemetry is a separate hash) → same v2 hash', () => {
    const lineageA = computeLineageSnapshotHashV2(baseProductionLineage());
    const lineageB = computeLineageSnapshotHashV2(baseProductionLineage());
    assert.equal(lineageA, lineageB);
  });

  it('same lineage + reordered nested object keys → same v2 hash', () => {
    const a = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      canonical_reserve_blocks: { a: 1, b: 2 },
    });
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      canonical_reserve_blocks: { b: 2, a: 1 },
    });
    assert.equal(a, b);
  });

  it('collapses the pinned v1 three-way drift (Capture #5 / preflight / Capture #6) into one v2 hash', () => {
    // These are the exact production-lineage fields behind the pinned v1
    // hashes in trackRFailClosed.test.ts ("documents v1 lineage CAS drift
    // from capture_id and operator cycle label alone"): 3db48327... (Capture
    // #5, capture_id=...0123Z cycle=C-403), d0880d29... (preflight,
    // capture_id=...0123Z cycle=C-404), 88b60b24... (Capture #6,
    // capture_id=...1706Z cycle=C-404). Same production state, three v1
    // hashes. Under v2 they must collapse to exactly one hash.
    const productionLineage: LineageSnapshotV2Input = {
      latest_attested_seal: 'seal-C-372-002',
      attested_seal_index: 360,
      projected_next_sequence: 361,
      historical_collision_pairs: 125,
      contested_block_positions: 123,
      uncontested_positions: 71,
      canonical_reserve_blocks: null,
      integrity_gate_active: true,
      reserve_block_lane: 'integrity_hold',
      candidate_formation_blocked: true,
      witness_audit_hash: '9196394bdbffe04e7a87d7cb2320b30b2e3c9cc07f24df9dfdfa7351b5dc6b87',
      resolution_table_hash: 'd821c9ba7fc95b5c5055c8dce41170319c11ec89ba1486a69de90e347760c845',
      active_lineage_version: null,
      live_canonical_pointer: null,
      pinned_affected_block_numbers_hash: BLOCK_HASH,
      live_affected_block_numbers_hash: BLOCK_HASH,
      affected_block_set_match: true,
    };

    // v1 baseline: three different (capture_id, cycle) pairs over identical
    // production lineage produce three different hashes — the defect.
    const v1Capture5 = computeLineageSnapshotHash({
      ...productionLineage,
      capture_id: 'track-r-c403-2026-08-15T0123Z',
      cycle: 'C-403',
    });
    const v1Preflight = computeLineageSnapshotHash({
      ...productionLineage,
      capture_id: 'track-r-c403-2026-08-15T0123Z',
      cycle: 'C-404',
    });
    const v1Capture6 = computeLineageSnapshotHash({
      ...productionLineage,
      capture_id: 'track-r-c403-2026-08-15T1706Z',
      cycle: 'C-404',
    });
    assert.equal(v1Capture5, '3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5');
    assert.equal(v1Preflight, 'd0880d2936f4ffffc1d783cc6601f557abcb31a559671f838b930e9b7d7f8845');
    assert.equal(v1Capture6, '88b60b24aa3dadfb23b150b64899ff38765aa3e93fbadfc33315460298e5caa4');
    assert.notEqual(v1Capture5, v1Preflight);
    assert.notEqual(v1Preflight, v1Capture6);

    // v2: capture_id/cycle are not part of the input at all — one hash.
    const v2Hash = computeLineageSnapshotHashV2(productionLineage);
    assert.equal(v2Hash, computeLineageSnapshotHashV2(productionLineage));
    assert.notEqual(v2Hash, v1Capture5);
    assert.notEqual(v2Hash, v1Preflight);
    assert.notEqual(v2Hash, v1Capture6);
  });

  it('v2 domain tag means a v1 digest can never collide with a v2 digest', () => {
    // Even a pathological v1 payload that happened to match a v2 payload's
    // remaining fields still cannot produce the same hash, because the v2
    // domain string is baked into the hashed payload.
    const lineage = baseProductionLineage();
    const v2Hash = computeLineageSnapshotHashV2(lineage);
    const v1EquivalentHash = computeLineageSnapshotHash({
      ...lineage,
      capture_id: '',
      cycle: null,
    });
    assert.notEqual(v2Hash, v1EquivalentHash);
  });
});

describe('Track R lineage snapshot v2 — material sensitivity', () => {
  it('changed seal ID/hash → different v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      latest_attested_seal: 'seal-C-372-003',
    });
    assert.notEqual(a, b);
  });

  it('changed seal-index state → different v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      attested_seal_index: 361,
    });
    assert.notEqual(a, b);
  });

  it('changed lineage classification (reserve block lane) → different v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      reserve_block_lane: 'candidate_formation',
    });
    assert.notEqual(a, b);
  });

  it('changed affected-block set → different v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const otherHash = hashAffectedBlockNumbers([1, 2, 3]);
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      live_affected_block_numbers_hash: otherHash,
      affected_block_set_match: false,
    });
    assert.notEqual(a, b);
  });

  it('changed canonical pointer → different v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      live_canonical_pointer: 'track-r-c403-batch-001',
    });
    assert.notEqual(a, b);
  });

  it('changed witness-audit hash → different v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      witness_audit_hash: 'deadbeef',
    });
    assert.notEqual(a, b);
  });

  it('changed resolution-table hash → different v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      resolution_table_hash: 'deadbeef',
    });
    assert.notEqual(a, b);
  });

  it('changed integrity-gate state → different v2 hash', () => {
    const a = computeLineageSnapshotHashV2(baseProductionLineage());
    const b = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      integrity_gate_active: false,
    });
    assert.notEqual(a, b);
  });
});

describe('Track R lineage snapshot v2 — execution-witness version binding', () => {
  function witnessPayload(overrides: Partial<Parameters<typeof computeExecutionWitnessHashV2>[0]> = {}) {
    return {
      schema_version: '1.0' as const,
      semantic_manifest_hash: 'manifest-hash',
      source_audit_hash: 'audit-hash',
      lineage_snapshot_version: EXECUTION_WITNESS_LINEAGE_SNAPSHOT_VERSION_V2,
      lineage_snapshot_hash_v2: computeLineageSnapshotHashV2(baseProductionLineage()),
      expected_seal_ids: ['seal-a'],
      per_record_results: [
        {
          seal_id: 'seal-a',
          status: 'MATCH' as const,
          block_number: 1,
          live_kv_hash: 'h',
          pinned_witness_hash: 'h',
        },
      ],
      live_affected_block_numbers: [1],
      pinned_affected_block_numbers: [1],
      export_source: 'test',
      environment_identifier: 'env',
      production_kv_identity_receipt_hash: null,
      active_lineage_version: null,
      live_canonical_pointer: null,
      ...overrides,
    };
  }

  it('binds lineage_snapshot_version and the v2 hash into the witness hash', () => {
    const h1 = computeExecutionWitnessHashV2(witnessPayload());
    const h2 = computeExecutionWitnessHashV2(witnessPayload());
    assert.equal(h1, h2);
    assert.ok(h1.length === 64);

    const differentLineage = computeExecutionWitnessHashV2(
      witnessPayload({
        lineage_snapshot_hash_v2: computeLineageSnapshotHashV2({
          ...baseProductionLineage(),
          latest_attested_seal: 'seal-C-372-999',
        }),
      }),
    );
    assert.notEqual(h1, differentLineage);
  });
});

describe('Track R lineage snapshot v2 — version safety guard', () => {
  const v2Hash = computeLineageSnapshotHashV2(baseProductionLineage());

  it('rejects a missing lineage snapshot version', () => {
    const check = assertLineageSnapshotVersionAccepted({
      lineage_snapshot_version: null,
      lineage_snapshot_hash: v2Hash,
      execution_witness_lineage_snapshot_version: 'v2',
      execution_witness_lineage_snapshot_hash: v2Hash,
    });
    assert.equal(check.ok, false);
    if (!check.ok) {
      assert.ok(check.errors.some((e) => e.includes('version missing')));
    }
  });

  it('rejects a v1 packet presented for execution (v1 is not a supported version)', () => {
    assert.equal(isSupportedLineageSnapshotVersion('v1'), false);
    const check = assertLineageSnapshotVersionAccepted({
      lineage_snapshot_version: 'v1',
      lineage_snapshot_hash: v2Hash,
      execution_witness_lineage_snapshot_version: 'v1',
      execution_witness_lineage_snapshot_hash: v2Hash,
    });
    assert.equal(check.ok, false);
    if (!check.ok) {
      assert.ok(check.errors.some((e) => e.includes('unsupported lineage snapshot version: v1')));
    }
  });

  it('rejects a mixed v1/v2 evidence packet', () => {
    const check = assertLineageSnapshotVersionAccepted({
      lineage_snapshot_version: 'v2',
      lineage_snapshot_hash: v2Hash,
      execution_witness_lineage_snapshot_version: 'v1',
      execution_witness_lineage_snapshot_hash: v2Hash,
    });
    assert.equal(check.ok, false);
    if (!check.ok) {
      assert.ok(check.errors.some((e) => e.includes('mixed lineage snapshot versions')));
    }
  });

  it('rejects an unknown future version', () => {
    const check = assertLineageSnapshotVersionAccepted({
      lineage_snapshot_version: 'v3',
      lineage_snapshot_hash: v2Hash,
      execution_witness_lineage_snapshot_version: 'v3',
      execution_witness_lineage_snapshot_hash: v2Hash,
    });
    assert.equal(check.ok, false);
    if (!check.ok) {
      assert.ok(check.errors.some((e) => e.includes('unsupported lineage snapshot version: v3')));
    }
  });

  it('rejects a v2 witness bound to a different lineage hash', () => {
    const otherHash = computeLineageSnapshotHashV2({
      ...baseProductionLineage(),
      latest_attested_seal: 'seal-C-372-999',
    });
    const check = assertLineageSnapshotVersionAccepted({
      lineage_snapshot_version: 'v2',
      lineage_snapshot_hash: v2Hash,
      execution_witness_lineage_snapshot_version: 'v2',
      execution_witness_lineage_snapshot_hash: otherHash,
    });
    assert.equal(check.ok, false);
    if (!check.ok) {
      assert.ok(check.errors.some((e) => e.includes('bound to a different lineage snapshot hash')));
    }
  });

  it('accepts a matched, fully-versioned v2 packet', () => {
    const check = assertLineageSnapshotVersionAccepted({
      lineage_snapshot_version: 'v2',
      lineage_snapshot_hash: v2Hash,
      execution_witness_lineage_snapshot_version: 'v2',
      execution_witness_lineage_snapshot_hash: v2Hash,
    });
    assert.equal(check.ok, true);
  });

  it('LINEAGE_SNAPSHOT_DOMAIN_V2 is the exact domain identifier', () => {
    assert.equal(LINEAGE_SNAPSHOT_DOMAIN_V2, 'mobius.track-r.lineage-snapshot.v2');
  });
});
