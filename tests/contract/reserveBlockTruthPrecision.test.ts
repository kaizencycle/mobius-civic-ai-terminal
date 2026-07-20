// C-377: collision affected-block snapshot + reserve block row badges.
// Run: tsx tests/contract/reserveBlockTruthPrecision.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Seal } from '@/lib/vault-v2/types';
import { analyzeReserveBlockCollisions } from '@/lib/dat/reserveBlockCollisions';
import {
  buildCollisionAffectedBlockSnapshot,
  collisionAffectedSets,
} from '@/lib/vault/collision-affected-blocks';
import { buildReserveBlockRows, resolveHistoricalBlockStatus } from '@/lib/vault/reserve-block-rows';
import { computeReserveBlockTruthSurface } from '@/lib/vault/reserve-block-truth';
import type { SealIntegrityGateState } from '@/lib/watchdog/sealIntegrityGate';

function makeSeal(id: string, sequence: number, hash: string, cycle: string): Seal {
  return {
    seal_id: id,
    sequence,
    seal_hash: hash,
    cycle_at_seal: cycle,
    status: 'attested',
    sealed_at: '2026-07-01T00:00:00.000Z',
    attestations: {
      ATLAS: { signature: 'sig', attested_at: '2026-07-01T00:00:00.000Z' },
      ZEUS: { signature: 'sig', attested_at: '2026-07-01T00:00:00.000Z' },
      EVE: { signature: 'sig', attested_at: '2026-07-01T00:00:00.000Z' },
      JADE: { signature: 'sig', attested_at: '2026-07-01T00:00:00.000Z' },
      AUREA: { signature: 'sig', attested_at: '2026-07-01T00:00:00.000Z' },
    },
    mic_value: 50,
    gi_at_seal: 0.8,
    source_entries: 1,
    prev_hash: 'sha256:prev',
  };
}

describe('reserveBlockTruthPrecision', () => {
  it('buildCollisionAffectedBlockSnapshot derives three-way blocks from seal counts', () => {
    const seals = [
      makeSeal('seal-a', 1, 'hash-a', 'C-332'),
      makeSeal('seal-b', 1, 'hash-b', 'C-359'),
      makeSeal('seal-c', 1, 'hash-c', 'C-372'),
      makeSeal('seal-d', 2, 'hash-d', 'C-360'),
      makeSeal('seal-e', 2, 'hash-e', 'C-361'),
    ];
    const report = analyzeReserveBlockCollisions(seals);
    const snapshot = buildCollisionAffectedBlockSnapshot({ report, seals });

    assert.equal(snapshot.affected_block_numbers.length, 2);
    assert.deepEqual(snapshot.three_way_blocks, [1]);
    assert.equal(snapshot.hash_divergent_pair_count, 3);
    assert.equal(snapshot.seal_count_by_block['1'], 3);
  });

  it('integrity hold maps attested rows to indexed unless contested', () => {
    const affected = new Set([2]);
    const threeWay = new Set<number>();

    assert.equal(
      resolveHistoricalBlockStatus({
        blockNumber: 1,
        attested: true,
        audited: true,
        isLatestAttested: false,
        latestImmortalized: false,
        integrityHold: true,
        collisionAffected: affected,
        threeWayBlocks: threeWay,
      }),
      'indexed',
    );

    assert.equal(
      resolveHistoricalBlockStatus({
        blockNumber: 2,
        attested: true,
        audited: true,
        isLatestAttested: false,
        latestImmortalized: false,
        integrityHold: true,
        collisionAffected: affected,
        threeWayBlocks: threeWay,
      }),
      'contested',
    );
  });

  it('gate off restores attested badge', () => {
    assert.equal(
      resolveHistoricalBlockStatus({
        blockNumber: 5,
        attested: true,
        audited: true,
        isLatestAttested: false,
        latestImmortalized: false,
        integrityHold: false,
        collisionAffected: new Set([5]),
        threeWayBlocks: null,
      }),
      'attested',
    );
  });

  it('buildReserveBlockRows uses collision sets only when integrity hold active', () => {
    const block = {
      block_size: 50,
      sealed_blocks: 3,
      audit_blocks: 3,
      completed_blocks_v1: 3,
      in_progress_block: 4,
      in_progress_balance: 10,
      in_progress_pct: 20,
      remaining_to_next_block: 40,
      label: 'test',
      canon: 'test',
    };
    const sets = collisionAffectedSets({
      schema_version: '1.0',
      audited_at: '2026-07-20T00:00:00.000Z',
      hash_divergent_pair_count: 1,
      unique_block_count: 3,
      raw_attested_count: 3,
      affected_block_numbers: [2],
      three_way_blocks: [],
      seal_count_by_block: { '2': 2 },
    });

    const held = buildReserveBlockRows({
      block,
      latestImmortalized: false,
      integrityHold: true,
      collisionAffected: sets?.affected,
      threeWayBlocks: sets?.threeWay,
    });
    assert.equal(held.find((r) => r.id === 1)?.status, 'indexed');
    assert.equal(held.find((r) => r.id === 2)?.status, 'contested');
    assert.equal(held.find((r) => r.id === 3)?.status, 'indexed');
  });

  it('truth surface passes through collision_affected_blocks unchanged', () => {
    const snapshot = buildCollisionAffectedBlockSnapshot({
      report: analyzeReserveBlockCollisions([
        makeSeal('a', 1, 'h1', 'C-1'),
        makeSeal('b', 1, 'h2', 'C-2'),
      ]),
      seals: [makeSeal('a', 1, 'h1', 'C-1'), makeSeal('b', 1, 'h2', 'C-2')],
    });
    const gate: SealIntegrityGateState = {
      enabled: true,
      active: true,
      reasons: ['collision'],
      alert_at: null,
      operator_cycle: 'C-377',
      source: 'live-report',
      authoritative_findings: [],
    };

    const truth = computeReserveBlockTruthSurface({
      reserve_block: {
        block_size: 50,
        sealed_blocks: 2,
        audit_blocks: 2,
        completed_blocks_v1: 2,
        in_progress_block: 3,
        in_progress_balance: 0,
        in_progress_pct: 0,
        remaining_to_next_block: 50,
        label: 'hold',
        canon: 'canon',
      },
      vault_seal_index_count: 2,
      vault_audit_index_count: 2,
      attestation_coverage: {
        examined: 2,
        immortalized: 2,
        errored: 0,
        unattested: 0,
        coverage_ratio: 1,
        has_gap: false,
        latest_error: null,
        gap_cycle_range: null,
      },
      seal_integrity_gate: gate,
      collision_pair_count: 1,
      candidate_in_flight: false,
      reserve_threshold_met: false,
      deposit_activity: { primary_kv_suspended: false, kv_reads_ok: true },
      collision_affected_blocks: snapshot,
    });

    assert.equal(truth.collision_affected_blocks?.affected_block_numbers.length, 1);
  });
});
