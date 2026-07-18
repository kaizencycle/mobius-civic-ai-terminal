// C-376: Reserve Block truth surface — canonical count invariant + era accounting.
// Run: tsx tests/contract/reserveBlockTruthSurface.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeVaultSealLaneSemantics } from '@/lib/vault/lane-status';
import {
  computeHistoricalEraBreakdown,
  computeReserveBlockTruthSurface,
  extractCollisionPairCount,
  resolveCanonicalReserveBlockCount,
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

const attestationCoverage = {
  examined: 319,
  immortalized: 319,
  errored: 0,
  unattested: 0,
  coverage_ratio: 1,
  has_gap: false,
  latest_error: null,
  gap_cycle_range: null,
};

function productionLikeTruth(gate: SealIntegrityGateState) {
  const lane = computeVaultSealLaneSemantics({
    inProgressBalance: 26.52,
    sealsCountAttested: 360,
    sealsAuditCount: 360,
    giCurrent: 0.96,
    giThreshold: 0.95,
    sustainCyclesRequired: 5,
    v1Status: 'sealed',
    candidateInFlight: false,
    sealIntegrityGateActive: gate.active,
  });

  return computeReserveBlockTruthSurface({
    reserve_block: lane.reserve_block,
    vault_seal_index_count: 360,
    vault_audit_index_count: 360,
    attestation_coverage: attestationCoverage,
    seal_integrity_gate: gate,
    collision_pair_count: 125,
    candidate_in_flight: false,
    reserve_threshold_met: lane.reserve_threshold_met,
    canonical_evidence: null,
  });
}

describe('reserveBlockTruthSurface', () => {
  it('extractCollisionPairCount reads hash_divergent_collisions independent of gate state', () => {
    assert.equal(extractCollisionPairCount([collisionFinding]), 125);
    assert.equal(extractCollisionPairCount(null), null);
  });

  it('gate state does not determine canonical count', () => {
    const engaged = productionLikeTruth(gateEngaged);
    const disengaged = productionLikeTruth(gateOff);

    assert.equal(engaged.canonical_reserve_blocks, null);
    assert.equal(disengaged.canonical_reserve_blocks, null);
    assert.equal(engaged.canonical_count_status, 'unresolved');
    assert.equal(disengaged.canonical_count_status, 'unresolved');
    assert.equal(engaged.formation_status, 'integrity_hold');
    assert.equal(disengaged.formation_status, 'formation_allowed');
  });

  it('canonical count remains unresolved when reconciliation source is absent', () => {
    const resolved = resolveCanonicalReserveBlockCount(null);
    assert.equal(resolved.count, null);
    assert.equal(resolved.status, 'unresolved');
    assert.equal(resolved.latest_canonical_seal_id, null);

    const truth = productionLikeTruth(gateEngaged);
    assert.equal(truth.canonical_reserve_blocks, null);
    assert.equal(truth.latest_canonical_seal_id, null);
    assert.match(truth.headline, /Integrity hold/);
    assert.match(truth.headline, /Projected accumulator slot/);
    assert.doesNotMatch(truth.headline, /360 Reserve Blocks sealed/);
  });

  it('gate off permits formation but does not promote index records into canon', () => {
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
      canonical_evidence: null,
    });

    assert.equal(lane.reserve_block_lane, 'sealed_blocks');
    assert.equal(truth.formation_status, 'formation_allowed');
    assert.equal(truth.canonical_reserve_blocks, null);
    assert.equal(truth.vault_index_records, 42);
    assert.match(truth.headline, /42 vault index records/);
  });

  it('legacy records are not counted as modern Reserve Blocks without classification evidence', () => {
    const breakdown = computeHistoricalEraBreakdown({
      collision_pair_count: 125,
      canonical_count_status: 'unresolved',
    });

    assert.equal(breakdown.pre_canon_records.count, null);
    assert.equal(breakdown.legacy_tranche_records.count, null);
    assert.equal(breakdown.modern_reserve_block_records.count, null);
    assert.equal(breakdown.alternate_or_collision_records.count, null);
    assert.equal(breakdown.legacy_tranche_records.status, 'verified_historical_era');
    assert.equal(breakdown.modern_reserve_block_records.status, 'reconciliation_pending');
    assert.match(breakdown.legacy_tranche_records.note ?? '', /C-299/);
    assert.doesNotMatch(breakdown.legacy_tranche_records.note ?? '', /Reserve Block/);
  });

  it('unknown era counts serialize as null, never zero', () => {
    const truth = productionLikeTruth(gateEngaged);
    const eras = truth.historical_era_breakdown;

    for (const era of Object.values(eras)) {
      assert.notEqual(era.count, 0, `era count must not be fabricated as zero: ${JSON.stringify(era)}`);
      assert.equal(era.count, null);
    }
  });

  it('canonical count resolves only from explicit reconciled evidence', () => {
    const resolved = resolveCanonicalReserveBlockCount({
      reconciled_block_count: 194,
      latest_canonical_seal_id: 'seal-C-370-canonical',
      source: 'track-r-reconciliation-index',
    });
    assert.equal(resolved.count, 194);
    assert.equal(resolved.status, 'resolved');

    const truth = computeReserveBlockTruthSurface({
      reserve_block: computeVaultSealLaneSemantics({
        inProgressBalance: 0,
        sealsCountAttested: 360,
        sealsAuditCount: 360,
        giCurrent: 0.96,
        giThreshold: 0.95,
        sustainCyclesRequired: 5,
        v1Status: 'sealed',
        candidateInFlight: false,
        sealIntegrityGateActive: false,
      }).reserve_block,
      vault_seal_index_count: 360,
      vault_audit_index_count: 360,
      attestation_coverage: attestationCoverage,
      seal_integrity_gate: gateOff,
      collision_pair_count: null,
      candidate_in_flight: false,
      reserve_threshold_met: false,
      canonical_evidence: {
        reconciled_block_count: 194,
        latest_canonical_seal_id: 'seal-C-370-canonical',
        source: 'track-r-reconciliation-index',
      },
    });

    assert.equal(truth.canonical_reserve_blocks, 194);
    assert.notEqual(truth.canonical_reserve_blocks, truth.vault_index_records);
    assert.equal(truth.latest_canonical_seal_id, 'seal-C-370-canonical');
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
    assert.match(lane.reserve_block.label, /Projected accumulator slot/);
  });

  it('projected slot uses index cardinality + 1, labeled operational not canonical', () => {
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
    assert.match(lane.reserve_block.label, /Projected accumulator slot 361/);

    const truth = productionLikeTruth(gateEngaged);
    assert.equal(truth.accumulator.operational_slot_projected, 361);
    assert.match(truth.accumulator.projection_note, /not a constitutionally adjudicated/);
  });
});
