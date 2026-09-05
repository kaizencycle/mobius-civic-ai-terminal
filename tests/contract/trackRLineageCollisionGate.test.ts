// C-425: Track R canonical lineage becomes authoritative for Reserve Block
// collision gating. Covers ATLAS handoff TEST A-H plus focused unit coverage
// for the effective-lineage loader and canonical-continuation planner.
// Run: tsx tests/contract/trackRLineageCollisionGate.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Seal } from '@/lib/vault-v2/types';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import { computeManifestHash } from '@/lib/watchdog/batchRepair/semanticManifest';
import {
  LINEAGE_ACTIVE_VERSION_KEY,
  versionedCanonicalKey,
  versionedManifestKey,
  versionedQuarantineKey,
} from '@/lib/watchdog/batchRepair/versionedStaging';
import {
  getEffectiveCanonicalLineage,
  type LineageKvReader,
} from '@/lib/watchdog/effectiveCanonicalLineage';
import {
  classifyCollisionsAgainstLineage,
  loadLineageAwareCollisionReport,
} from '@/lib/watchdog/trackRLineageCollisionGate';
import { checkBlockCollisionsWithLineage } from '@/lib/watchdog/kvHealthChecks';
import { planCanonicalContinuation } from '@/lib/watchdog/canonicalContinuationPlan';

function baseSeal(overrides: Partial<Seal> & Pick<Seal, 'seal_id' | 'sequence' | 'seal_hash'>): Seal {
  return {
    cycle_at_seal: 'C-425',
    sealed_at: '2026-08-01T00:00:00.000Z',
    reserve: 50,
    gi_at_seal: 0.8,
    mode_at_seal: 'yellow',
    source_entries: 1,
    deposit_hashes: [],
    prev_seal_hash: null,
    attestations: {},
    status: 'attested',
    fountain_status: 'pending',
    fountain_emitted_at: null,
    posture: null,
    ...overrides,
  };
}

function buildManifest(overrides: {
  repair_id: string;
  canonical_assignments: Record<string, string>;
  quarantined_seal_ids: string[];
}): CollisionRepairBatchManifest {
  const body: Omit<CollisionRepairBatchManifest, 'manifest_hash'> = {
    schema_version: '1.0',
    repair_id: overrides.repair_id,
    cycle: 'C-425',
    strategy: 'component_coherent_hybrid',
    source_audit_hash: 'test-source-audit-hash',
    resolution_table_hash: 'test-resolution-table-hash',
    total_block_positions: 194,
    contested_positions: 123,
    historical_hash_divergent_pairs: 125,
    canonical_assignment_count: 123,
    quarantined_conflicting_seal_count: 125,
    clean_position_count: 71,
    receipts: [],
    canonical_assignments: overrides.canonical_assignments,
    quarantined_seal_ids: overrides.quarantined_seal_ids,
    boundary_expectations: { '41->42': 'must_pass', '131->132': 'pending_track_r_step_8' },
    governance_disposition: {
      promoted_canonical_through_position: 131,
      proposed_latest_canonical_seal_id: 'seal-test-latest',
      preserved_unattached: { from_position: 132, to_position: 194, status: 'verified_unattached' },
      boundary_131_132_edge: 'not_fabricated',
      requires_post_repair_audit_before_attach: true,
    },
    production_execution_enabled: false,
    zeus_verdict: 'approved',
    eve_verdict: 'approved',
    human_approval: 'approved',
    created_at: '2026-08-23T00:00:00.000Z',
  };
  return { ...body, manifest_hash: computeManifestHash(body) };
}

function fakeReader(map: Record<string, unknown>): LineageKvReader {
  return async (key: string) => (key in map ? map[key] : null);
}

function activeLineageMap(args: {
  repair_id: string;
  canonical_assignments: Record<string, string>;
  quarantined_seal_ids: string[];
}): Record<string, unknown> {
  const manifest = buildManifest(args);
  return {
    [LINEAGE_ACTIVE_VERSION_KEY]: args.repair_id,
    [versionedManifestKey(args.repair_id)]: manifest,
    [versionedCanonicalKey(args.repair_id)]: args.canonical_assignments,
    [versionedQuarantineKey(args.repair_id)]: args.quarantined_seal_ids,
  };
}

describe('C-425 Track R lineage collision gate', () => {
  it('TEST A — raw collision without Track R: unresolved, gate ACTIVE', async () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-A-1', sequence: 5, seal_hash: 'hash-a', sealed_at: '2026-08-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-A-2', sequence: 5, seal_hash: 'hash-b', sealed_at: '2026-07-01T09:00:00Z' }),
    ];
    const lineage = await getEffectiveCanonicalLineage(fakeReader({}));
    assert.strictEqual(lineage.ok, false);
    if (!lineage.ok) assert.strictEqual(lineage.reason, 'no_active_version');

    const report = classifyCollisionsAgainstLineage({ seals, lineage });
    assert.strictEqual(report.raw_collision_count, 1);
    assert.strictEqual(report.resolved_collision_count, 0);
    assert.strictEqual(report.unresolved_collision_count, 1);

    const finding = await checkBlockCollisionsWithLineage(seals, fakeReader({}));
    assert.strictEqual(finding.severity, 'critical');
    assert.strictEqual(finding.ok, false);
  });

  it('TEST B — collision resolved by active canonical lineage: resolved=1, unresolved=0, raw preserved', async () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-B-winner', sequence: 5, seal_hash: 'hash-a', sealed_at: '2026-08-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-B-loser', sequence: 5, seal_hash: 'hash-b', sealed_at: '2026-07-01T09:00:00Z' }),
    ];
    const kv = activeLineageMap({
      repair_id: 'track-r-test-batch',
      canonical_assignments: { '5': 'seal-B-winner' },
      quarantined_seal_ids: ['seal-B-loser'],
    });
    const lineage = await getEffectiveCanonicalLineage(fakeReader(kv));
    assert.strictEqual(lineage.ok, true);

    const report = classifyCollisionsAgainstLineage({ seals, lineage });
    assert.strictEqual(report.raw_collision_count, 1, 'raw collision must remain visible');
    assert.strictEqual(report.resolved_collision_count, 1);
    assert.strictEqual(report.unresolved_collision_count, 0);

    const finding = await checkBlockCollisionsWithLineage(seals, fakeReader(kv));
    // Collision component of the gate may clear — severity must not be critical.
    assert.notStrictEqual(finding.severity, 'critical');
    // But the raw collision must never be reported as if it never existed.
    assert.strictEqual((finding.evidence as { raw_collision_count: number }).raw_collision_count, 1);
  });

  it('TEST C — incomplete Track R (canonical mapping missing for a collision): unresolved, gate ACTIVE', async () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-C-1', sequence: 7, seal_hash: 'hash-a', sealed_at: '2026-08-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-C-2', sequence: 7, seal_hash: 'hash-b', sealed_at: '2026-07-01T09:00:00Z' }),
    ];
    const kv = activeLineageMap({
      repair_id: 'track-r-test-batch',
      canonical_assignments: {}, // block 7 not covered at all
      quarantined_seal_ids: [],
    });
    const lineage = await getEffectiveCanonicalLineage(fakeReader(kv));
    assert.strictEqual(lineage.ok, true);

    const report = classifyCollisionsAgainstLineage({ seals, lineage });
    assert.strictEqual(report.unresolved_collision_count, 1);
    assert.deepStrictEqual(report.unresolved_block_numbers, [7]);

    const finding = await checkBlockCollisionsWithLineage(seals, fakeReader(kv));
    assert.strictEqual(finding.severity, 'critical');
  });

  it('TEST D — bad canonical pointer (missing / quarantined / wrong-sequence seal): unresolved, gate ACTIVE', async () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-D-1', sequence: 9, seal_hash: 'hash-a', sealed_at: '2026-08-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-D-2', sequence: 9, seal_hash: 'hash-b', sealed_at: '2026-07-01T09:00:00Z' }),
    ];

    // (a) canonical index points to a seal_id that does not exist in KV at all.
    const missingSealKv = activeLineageMap({
      repair_id: 'track-r-test-batch',
      canonical_assignments: { '9': 'seal-D-does-not-exist' },
      quarantined_seal_ids: [],
    });
    const missingSealLineage = await getEffectiveCanonicalLineage(fakeReader(missingSealKv));
    assert.strictEqual(missingSealLineage.ok, true);
    const missingSealReport = classifyCollisionsAgainstLineage({ seals, lineage: missingSealLineage });
    assert.strictEqual(missingSealReport.unresolved_collision_count, 1);

    // (b) canonical index points to a seal that is itself quarantined.
    const quarantinedPointerKv = activeLineageMap({
      repair_id: 'track-r-test-batch',
      canonical_assignments: { '9': 'seal-D-1' },
      quarantined_seal_ids: ['seal-D-1'],
    });
    const quarantinedPointerLineage = await getEffectiveCanonicalLineage(fakeReader(quarantinedPointerKv));
    assert.strictEqual(quarantinedPointerLineage.ok, true);
    const quarantinedPointerReport = classifyCollisionsAgainstLineage({
      seals,
      lineage: quarantinedPointerLineage,
    });
    assert.strictEqual(quarantinedPointerReport.unresolved_collision_count, 1);

    // (c) canonical index points to a seal_id that belongs to a different block entirely
    // (fails closed the same way as a missing seal_id — the resolver never widens its
    // search outside the collision's own block group).
    const wrongSequenceSeals: Seal[] = [
      ...seals,
      baseSeal({ seal_id: 'seal-D-other-block', sequence: 10, seal_hash: 'hash-c' }),
    ];
    const wrongSequenceKv = activeLineageMap({
      repair_id: 'track-r-test-batch',
      canonical_assignments: { '9': 'seal-D-other-block' },
      quarantined_seal_ids: [],
    });
    const wrongSequenceLineage = await getEffectiveCanonicalLineage(fakeReader(wrongSequenceKv));
    assert.strictEqual(wrongSequenceLineage.ok, true);
    const wrongSequenceReport = classifyCollisionsAgainstLineage({
      seals: wrongSequenceSeals,
      lineage: wrongSequenceLineage,
    });
    assert.strictEqual(wrongSequenceReport.unresolved_collision_count, 1);
  });

  it('TEST E — new post-Track-R collision reactivates the gate immediately', async () => {
    const resolvedBlockSeals: Seal[] = [
      baseSeal({ seal_id: 'seal-E-winner', sequence: 5, seal_hash: 'hash-a', sealed_at: '2026-08-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-E-loser', sequence: 5, seal_hash: 'hash-b', sealed_at: '2026-07-01T09:00:00Z' }),
    ];
    const newCollisionSeals: Seal[] = [
      baseSeal({ seal_id: 'seal-E-new-1', sequence: 42, seal_hash: 'hash-x', sealed_at: '2026-09-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-E-new-2', sequence: 42, seal_hash: 'hash-y', sealed_at: '2026-09-01T09:05:00Z' }),
    ];
    const seals = [...resolvedBlockSeals, ...newCollisionSeals];

    const kv = activeLineageMap({
      repair_id: 'track-r-test-batch',
      canonical_assignments: { '5': 'seal-E-winner' }, // only the historical block is covered
      quarantined_seal_ids: ['seal-E-loser'],
    });
    const lineage = await getEffectiveCanonicalLineage(fakeReader(kv));
    assert.strictEqual(lineage.ok, true);

    const report = classifyCollisionsAgainstLineage({ seals, lineage });
    assert.strictEqual(report.raw_collision_count, 2);
    assert.strictEqual(report.resolved_collision_count, 1, 'historical block 5 stays resolved');
    assert.strictEqual(report.unresolved_collision_count, 1, 'new block 42 collision is unresolved');
    assert.deepStrictEqual(report.unresolved_block_numbers, [42]);

    const finding = await checkBlockCollisionsWithLineage(seals, fakeReader(kv));
    assert.strictEqual(finding.severity, 'critical', 'gate must reactivate for the uncovered new collision');
  });

  it('TEST F — canonical continuation never reuses the conflicting/quarantined branch', async () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-F-canonical-10', sequence: 10, seal_hash: 'hash-a', sealed_at: '2026-08-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-F-canonical-11', sequence: 11, seal_hash: 'hash-b', sealed_at: '2026-08-02T09:00:00Z' }),
      // A quarantined branch that is sealed LATER than the canonical chain but must never win.
      baseSeal({ seal_id: 'seal-F-quarantined-99', sequence: 99, seal_hash: 'hash-bad', sealed_at: '2026-08-05T09:00:00Z' }),
    ];
    const kv = activeLineageMap({
      repair_id: 'track-r-test-batch',
      canonical_assignments: {},
      quarantined_seal_ids: ['seal-F-quarantined-99'],
    });
    const lineage = await getEffectiveCanonicalLineage(fakeReader(kv));
    assert.strictEqual(lineage.ok, true);

    const plan = planCanonicalContinuation({ seals, lineage });
    assert.strictEqual(plan.ok, true);
    if (plan.ok) {
      assert.strictEqual(plan.target_seal_id, 'seal-F-canonical-11');
      assert.strictEqual(plan.target_sequence, 11);
      assert.strictEqual(plan.next_sequence, 12);
    }
  });

  it('TEST G — Track R unavailable/corrupt: gate ACTIVE, no optimistic fallback', async () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-G-1', sequence: 3, seal_hash: 'hash-a', sealed_at: '2026-08-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-G-2', sequence: 3, seal_hash: 'hash-b', sealed_at: '2026-07-01T09:00:00Z' }),
    ];

    // Tampered manifest: stored manifest_hash no longer matches the manifest body.
    const manifest = buildManifest({
      repair_id: 'track-r-test-batch',
      canonical_assignments: { '3': 'seal-G-1' },
      quarantined_seal_ids: ['seal-G-2'],
    });
    const corruptManifest = { ...manifest, manifest_hash: 'deadbeef' };
    const corruptKv: Record<string, unknown> = {
      [LINEAGE_ACTIVE_VERSION_KEY]: 'track-r-test-batch',
      [versionedManifestKey('track-r-test-batch')]: corruptManifest,
      [versionedCanonicalKey('track-r-test-batch')]: { '3': 'seal-G-1' },
      [versionedQuarantineKey('track-r-test-batch')]: ['seal-G-2'],
    };

    const lineage = await getEffectiveCanonicalLineage(fakeReader(corruptKv));
    assert.strictEqual(lineage.ok, false);
    if (!lineage.ok) assert.strictEqual(lineage.reason, 'manifest_hash_mismatch');

    const report = classifyCollisionsAgainstLineage({ seals, lineage });
    assert.strictEqual(report.unresolved_collision_count, 1, 'no optimistic fallback on corrupt lineage');

    const finding = await checkBlockCollisionsWithLineage(seals, fakeReader(corruptKv));
    assert.strictEqual(finding.severity, 'critical');

    const plan = planCanonicalContinuation({ seals, lineage });
    assert.strictEqual(plan.ok, false);
    if (!plan.ok) assert.strictEqual(plan.reason, 'lineage_untrusted');
  });

  it('TEST H — immutable evidence: classification never mutates raw seal records', async () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-H-1', sequence: 20, seal_hash: 'hash-a', sealed_at: '2026-08-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-H-2', sequence: 20, seal_hash: 'hash-b', sealed_at: '2026-07-01T09:00:00Z' }),
    ];
    const before = JSON.stringify(seals);

    const kv = activeLineageMap({
      repair_id: 'track-r-test-batch',
      canonical_assignments: { '20': 'seal-H-1' },
      quarantined_seal_ids: ['seal-H-2'],
    });
    const lineage = await getEffectiveCanonicalLineage(fakeReader(kv));
    classifyCollisionsAgainstLineage({ seals, lineage });
    planCanonicalContinuation({ seals, lineage });
    await checkBlockCollisionsWithLineage(seals, fakeReader(kv));

    assert.strictEqual(JSON.stringify(seals), before, 'seal records must remain byte-identical');
  });

  it('loadLineageAwareCollisionReport composes the KV-backed loader with the pure classifier', async () => {
    // Smoke test only — real KV is unavailable in this environment; confirms the
    // async wiring path (getEffectiveCanonicalLineage -> classify) does not throw
    // and fails closed when no lineage is configured.
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-I-1', sequence: 1, seal_hash: 'hash-a' }),
    ];
    const report = await loadLineageAwareCollisionReport(seals);
    assert.strictEqual(report.raw_collision_count, 0);
  });
});
