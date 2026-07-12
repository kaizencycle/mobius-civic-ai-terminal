// C-370: reserve block_number collision dedupe — export + integrity cron depend on this.
// Run: tsx tests/contract/reserveBlockCollisions.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeReserveBlockCollisions,
  dedupeBlocksByNumber,
  pickPreferredSeal,
  quorumCount,
} from '../../lib/dat/reserveBlockCollisions.ts';
import type { Seal } from '../../lib/vault-v2/types.ts';
import type { VaultSealedBlock } from '../../lib/dat/types.ts';

function makeSeal(overrides: Partial<Seal> & { sequence: number; seal_id: string }): Seal {
  return {
    status: 'attested',
    cycle_at_seal: 'C-370',
    sealed_at: '2026-07-12T00:00:00.000Z',
    seal_hash: `hash-${overrides.seal_id}`,
    attestations: {},
    ...overrides,
  } as Seal;
}

describe('reserveBlockCollisions', () => {
  it('pickPreferredSeal prefers higher quorum', () => {
    const low = makeSeal({
      sequence: 1,
      seal_id: 'a',
      attestations: {
        ATLAS: {
          agent: 'ATLAS',
          signature: 'sig',
          verdict: 'pass',
          rationale: 'ok',
          gi_at_attestation: 0.9,
          timestamp: '2026-07-12T00:00:00.000Z',
        },
      },
    });
    const high = makeSeal({
      sequence: 1,
      seal_id: 'b',
      attestations: {
        ATLAS: {
          agent: 'ATLAS',
          signature: 'sig',
          verdict: 'pass',
          rationale: 'ok',
          gi_at_attestation: 0.9,
          timestamp: '2026-07-12T00:00:00.000Z',
        },
        ZEUS: {
          agent: 'ZEUS',
          signature: 'sig',
          verdict: 'pass',
          rationale: 'ok',
          gi_at_attestation: 0.9,
          timestamp: '2026-07-12T00:00:00.000Z',
        },
      },
    });
    assert.ok(quorumCount(high) > quorumCount(low));
    assert.equal(pickPreferredSeal(low, high), high);
  });

  it('analyzeReserveBlockCollisions reports collisions and hash divergence', () => {
    const seals = [
      makeSeal({ sequence: 1, seal_id: 'keep', seal_hash: 'hash-a' }),
      makeSeal({
        sequence: 1,
        seal_id: 'drop',
        seal_hash: 'hash-b',
        sealed_at: '2026-07-11T00:00:00.000Z',
      }),
      makeSeal({ sequence: 2, seal_id: 'solo' }),
    ];
    const report = analyzeReserveBlockCollisions(seals);
    assert.equal(report.raw_attested_count, 3);
    assert.equal(report.unique_block_count, 2);
    assert.equal(report.collision_count, 1);
    assert.equal(report.collisions[0].seal_hashes_differ, true);
    assert.equal(report.alert, true);
  });

  it('dedupeBlocksByNumber keeps one block per block_number', () => {
    const blocks: VaultSealedBlock[] = [
      {
        block_number: 1,
        seal_id: 'a',
        sealed_at: '2026-07-11',
        quorum: ['ATLAS'],
        cycle: 'C-370',
        gi_at_seal: 0.9,
        source_entries: 1,
        fountain_status: 'locked',
      },
      {
        block_number: 1,
        seal_id: 'b',
        sealed_at: '2026-07-12',
        quorum: ['ATLAS', 'ZEUS'],
        cycle: 'C-370',
        gi_at_seal: 0.9,
        source_entries: 1,
        fountain_status: 'locked',
      },
      {
        block_number: 2,
        seal_id: 'c',
        sealed_at: '2026-07-12',
        quorum: [],
        cycle: 'C-370',
        gi_at_seal: 0.9,
        source_entries: 1,
        fountain_status: 'locked',
      },
    ];
    const deduped = dedupeBlocksByNumber(blocks, false);
    assert.equal(deduped.length, 2);
    assert.equal(deduped.find((b) => b.block_number === 1)?.seal_id, 'b');
  });
});
