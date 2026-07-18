// C-376: Reserve Block truth surface — vault index vs canonical lineage.
// Run: tsx tests/contract/reserveBlockTruthSurface.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeVaultSealLaneSemantics } from '@/lib/vault/lane-status';
import {
  computeReserveBlockTruthSurface,
  extractCollisionPairCount,
} from '@/lib/vault/reserve-block-truth';
import type { SealIntegrityGateState } from '@/lib/watchdog/sealIntegrityGate';
import type { KvWatchdogFinding } from '@/lib/watchdog/kvHealthChecks';

const gateEngaged: SealIntegrityGateState = {
  enabled: true,
  active: true,
  reasons: ['125 hash-divergent block_number collision(s) in attested KV'],
  alert_at: null,
  operator_cycle: 'C-373',
  source: 'live-report',
};

const gateOff: SealIntegrityGateState = {
  enabled: true,
  active: false,
  reasons: [],
  alert_at: null,
  operator_cycle: null,
  source: 'live-report',
};

const collisionFinding: KvWatchdogFinding = {
  check: 'block_number_collisions',
  severity: 'critical',
  ok: false,
  message: '125 hash-divergent block_number collision(s) in attested KV',
  evidence: { hash_divergent_collisions: 125, collision_count: 125 },
};

describe('reserveBlockTruthSurface', () => {
  it('extractCollisionPairCount reads hash_divergent_collisions from watchdog findings', () => {
    const count = extractCollisionPairCount(gateEngaged, [collisionFinding]);
    assert.equal(count, 125);
  });

  it('integrity gate blocks block_ready lane even when threshold met', () => {
    const lane = computeVaultSealLaneSemantics({
      inProgressBalance: 50,
      sealsCountAttested: 360,
      sealsAuditCount: 360,
      giCurrent: 0.96,
      giThreshold: 0.95,
      sustainCyclesRequired: 5,
      v1Status: 'sealed',
      candidateInFlight: false,
      sealIntegrityGateActive: true,
    });
    assert.equal(lane.reserve_block_lane, 'integrity_hold');
    assert.equal(lane.reserve_threshold_met, true);
    assert.match(lane.headline, /Integrity hold/);
    assert.doesNotMatch(lane.headline, /360 Reserve Blocks sealed/);
  });

  it('truth surface separates vault index from canonical blocks when gate engaged', () => {
    const lane = computeVaultSealLaneSemantics({
      inProgressBalance: 26.52,
      sealsCountAttested: 360,
      sealsAuditCount: 360,
      giCurrent: 0.96,
      giThreshold: 0.95,
      sustainCyclesRequired: 5,
      v1Status: 'sealed',
      candidateInFlight: false,
      sealIntegrityGateActive: true,
    });

    const truth = computeReserveBlockTruthSurface({
      reserve_block: lane.reserve_block,
      vault_seal_index_count: 360,
      vault_audit_index_count: 360,
      attestation_coverage: {
        examined: 319,
        immortalized: 319,
        errored: 0,
        unattested: 0,
        coverage_ratio: 1,
        has_gap: false,
        latest_error: null,
        gap_cycle_range: null,
      },
      seal_integrity_gate: gateEngaged,
      collision_pair_count: 125,
      candidate_in_flight: false,
      reserve_threshold_met: lane.reserve_threshold_met,
      latest_seal_id: null,
    });

    assert.equal(truth.vault_seal_index_count, 360);
    assert.equal(truth.attested_seals_examined, 319);
    assert.equal(truth.collision_pair_count, 125);
    assert.equal(truth.canonical_reserve_blocks, null);
    assert.equal(truth.canonical_lineage_status, 'unresolved_pending_reconciliation');
    assert.equal(truth.formation_status, 'integrity_hold');
    assert.equal(truth.integrity_gate.sealing_suspended, true);
    assert.equal(truth.accumulator.candidate_formation_blocked, true);
    assert.equal(truth.accumulator.in_progress_block_projected, 361);
    assert.match(truth.operator_summary, /Deposits active/);
    assert.match(truth.operator_summary, /sealing suspended/);
  });

  it('in_progress block is seals_count + 1 projection under gate', () => {
    const lane = computeVaultSealLaneSemantics({
      inProgressBalance: 26.52,
      sealsCountAttested: 360,
      sealsAuditCount: 360,
      giCurrent: 0.96,
      giThreshold: 0.95,
      sustainCyclesRequired: 5,
      v1Status: 'sealed',
      candidateInFlight: false,
      sealIntegrityGateActive: true,
    });
    assert.equal(lane.reserve_block.in_progress_block, 361);
    assert.equal(lane.reserve_block.sealed_blocks, 360);
  });

  it('when gate is off, canonical count equals seal index count', () => {
    const lane = computeVaultSealLaneSemantics({
      inProgressBalance: 10,
      sealsCountAttested: 42,
      sealsAuditCount: 42,
      giCurrent: 0.96,
      giThreshold: 0.95,
      sustainCyclesRequired: 5,
      v1Status: 'sealed',
      candidateInFlight: false,
      sealIntegrityGateActive: false,
    });

    const truth = computeReserveBlockTruthSurface({
      reserve_block: lane.reserve_block,
      vault_seal_index_count: 42,
      vault_audit_index_count: 42,
      attestation_coverage: {
        examined: 42,
        immortalized: 42,
        errored: 0,
        unattested: 0,
        coverage_ratio: 1,
        has_gap: false,
        latest_error: null,
        gap_cycle_range: null,
      },
      seal_integrity_gate: gateOff,
      collision_pair_count: null,
      candidate_in_flight: false,
      reserve_threshold_met: false,
      latest_seal_id: 'seal-42',
    });

    assert.equal(truth.canonical_reserve_blocks, 42);
    assert.equal(truth.canonical_lineage_status, 'reconciled');
    assert.equal(lane.reserve_block_lane, 'sealed_blocks');
  });
});
