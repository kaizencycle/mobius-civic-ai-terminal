// C-373: collision audit invariants
// Run: tsx tests/contract/collisionAudit.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditHasCriticalCollisions,
  buildCollisionAuditReport,
  buildPreferenceRationale,
} from '@/lib/watchdog/collisionAudit';
import type { Seal } from '@/lib/vault-v2/types';

function makeSeal(overrides: Partial<Seal> & { sequence: number; seal_id: string }): Seal {
  return {
    status: 'attested',
    cycle_at_seal: 'C-373',
    sealed_at: '2026-07-15T00:00:00.000Z',
    seal_hash: `hash-${overrides.seal_id}`,
    attestations: {},
    deposit_hashes: [],
    source_entries: 1,
    ...overrides,
  } as Seal;
}

function withQuorum(seal: Seal, agents: Array<'ATLAS' | 'ZEUS'>): Seal {
  const attestations = { ...seal.attestations };
  for (const agent of agents) {
    attestations[agent] = {
      agent,
      signature: 'sig',
      verdict: 'pass',
      rationale: 'ok',
      gi_at_attestation: 0.9,
      timestamp: seal.sealed_at,
    };
  }
  return { ...seal, attestations };
}

describe('collisionAudit', () => {
  it('reports no collisions when sequences are unique', () => {
    const report = buildCollisionAuditReport(
      [makeSeal({ sequence: 1, seal_id: 'a' }), makeSeal({ sequence: 2, seal_id: 'b' })],
      { cycle: 'C-373' },
    );
    assert.equal(report.collision_group_count, 0);
    assert.equal(report.critical, false);
    assert.equal(auditHasCriticalCollisions(report), false);
  });

  it('same sequence and same hash is not hash-divergent', () => {
    const report = buildCollisionAuditReport(
      [
        makeSeal({ sequence: 5, seal_id: 'a', seal_hash: 'same' }),
        makeSeal({ sequence: 5, seal_id: 'b', seal_hash: 'same', sealed_at: '2026-07-14T00:00:00.000Z' }),
      ],
      { cycle: 'C-373' },
    );
    assert.equal(report.collision_group_count, 1);
    assert.equal(report.collisions[0].hash_divergent, false);
    assert.equal(report.collisions[0].requires_human_review, false);
    assert.equal(report.critical, false);
  });

  it('same sequence and different hashes requires human review', () => {
    const report = buildCollisionAuditReport(
      [
        makeSeal({ sequence: 5, seal_id: 'a', seal_hash: 'hash-a' }),
        makeSeal({ sequence: 5, seal_id: 'b', seal_hash: 'hash-b' }),
      ],
      { cycle: 'C-373' },
    );
    assert.equal(report.hash_divergent_group_count, 1);
    assert.equal(report.collisions[0].requires_human_review, true);
    assert.equal(report.critical, true);
  });

  it('three-way collision includes all candidates', () => {
    const report = buildCollisionAuditReport(
      [
        makeSeal({ sequence: 10, seal_id: 'x', seal_hash: 'h1' }),
        makeSeal({ sequence: 10, seal_id: 'y', seal_hash: 'h2' }),
        makeSeal({ sequence: 10, seal_id: 'z', seal_hash: 'h3' }),
      ],
      { cycle: 'C-373' },
    );
    assert.equal(report.collisions[0].candidate_seals.length, 3);
    assert.equal(report.collisions[0].hash_divergent, true);
  });

  it('quorum winner drives algorithm preference', () => {
    const low = makeSeal({ sequence: 3, seal_id: 'low' });
    const high = withQuorum(makeSeal({ sequence: 3, seal_id: 'high' }), ['ATLAS', 'ZEUS']);
    const report = buildCollisionAuditReport([low, high], { cycle: 'C-373' });
    assert.equal(report.collisions[0].preferred_by_current_algorithm, 'high');
    const rationale = buildPreferenceRationale(high, [low, high]);
    assert.ok(rationale.some((r) => r.includes('quorum')));
  });

  it('timestamp winner when quorum tied', () => {
    const older = makeSeal({ sequence: 4, seal_id: 'old', sealed_at: '2026-07-10T00:00:00.000Z' });
    const newer = makeSeal({ sequence: 4, seal_id: 'new', sealed_at: '2026-07-15T00:00:00.000Z' });
    const report = buildCollisionAuditReport([older, newer], { cycle: 'C-373' });
    assert.equal(report.collisions[0].preferred_by_current_algorithm, 'new');
  });

  it('seal_id tie-break when quorum and timestamp tied', () => {
    const a = makeSeal({ sequence: 6, seal_id: 'seal-a', sealed_at: '2026-07-15T00:00:00.000Z' });
    const b = makeSeal({ sequence: 6, seal_id: 'seal-z', sealed_at: '2026-07-15T00:00:00.000Z' });
    const report = buildCollisionAuditReport([a, b], { cycle: 'C-373' });
    assert.equal(report.collisions[0].preferred_by_current_algorithm, 'seal-z');
  });

  it('distinguishes algorithmically preferred from canonically proven', () => {
    const report = buildCollisionAuditReport(
      [
        makeSeal({ sequence: 1, seal_id: 'a', seal_hash: 'h1' }),
        makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' }),
      ],
      { cycle: 'C-373' },
    );
    const state = report.collisions[0].resolution_state;
    assert.ok(state.algorithmically_preferred);
    assert.equal(state.canonically_proven, null);
    assert.equal(state.human_approved, null);
  });
});
