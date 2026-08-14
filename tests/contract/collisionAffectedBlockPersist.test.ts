// C-403: Primary KV affected-block snapshot persistence
// Run: tsx tests/contract/collisionAffectedBlockPersist.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { buildAffectedBlockSnapshotFromSeals } from '@/lib/vault/collision-affected-blocks';
import {
  buildFixtureSealsFromWitness,
  loadResolutionTableFromFile,
  loadWitnessFromFile,
  shouldPreferWatchdogAffectedBlockSnapshot,
  validateCompletePrimarySealReads,
} from '@/lib/watchdog/batchRepair';
import type { PrimarySealBatchRead } from '@/lib/vault-v2/store';

const FIXTURE_DIR = join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures');
const WITNESS_PATH = join(FIXTURE_DIR, 'C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json');
const TABLE_PATH = join(FIXTURE_DIR, 'C403_COLLISION_RESOLUTION_TABLE.pin.json');

describe('collisionAffectedBlockPersist C-403', () => {
  it('buildAffectedBlockSnapshotFromSeals matches pinned contested count', () => {
    const witness = loadWitnessFromFile(WITNESS_PATH);
    const table = loadResolutionTableFromFile(TABLE_PATH);
    const seals = buildFixtureSealsFromWitness(witness, table);
    const snapshot = buildAffectedBlockSnapshotFromSeals({
      seals,
      operator_cycle: 'C-403',
      audited_at: '2026-08-14T12:00:00.000Z',
    });

    assert.equal(snapshot.affected_block_numbers.length, witness.contested_block_numbers.length);
    assert.deepEqual(snapshot.affected_block_numbers, [...witness.contested_block_numbers].sort((a, b) => a - b));
    assert.equal(snapshot.hash_divergent_pair_count, 125);
    assert.equal(snapshot.schema_version, '1.0');
  });

  it('buildAffectedBlockSnapshotFromSeals includes three-way blocks from fixture', () => {
    const witness = loadWitnessFromFile(WITNESS_PATH);
    const table = loadResolutionTableFromFile(TABLE_PATH);
    const seals = buildFixtureSealsFromWitness(witness, table);
    const snapshot = buildAffectedBlockSnapshotFromSeals({
      seals,
      operator_cycle: 'C-403',
    });

    assert.ok(snapshot.three_way_blocks.includes(1));
    assert.ok(snapshot.three_way_blocks.includes(2));
  });

  it('shouldPreferWatchdogAffectedBlockSnapshot rejects stale non-empty cache when derived is empty', () => {
    const witness = loadWitnessFromFile(WITNESS_PATH);
    const table = loadResolutionTableFromFile(TABLE_PATH);
    const seals = buildFixtureSealsFromWitness(witness, table);
    const stored = buildAffectedBlockSnapshotFromSeals({
      seals,
      operator_cycle: 'C-403',
      audited_at: '2026-08-01T00:00:00.000Z',
    });
    const derivedEmpty = buildAffectedBlockSnapshotFromSeals({
      seals: seals.filter((s) => s.status !== 'attested'),
      operator_cycle: 'C-403',
      audited_at: '2026-08-14T13:00:00.000Z',
    });

    assert.equal(stored.affected_block_numbers.length > 0, true);
    assert.equal(derivedEmpty.affected_block_numbers.length, 0);
    assert.equal(
      shouldPreferWatchdogAffectedBlockSnapshot({
        stored,
        derived: derivedEmpty,
        capture_observed_at: '2026-08-14T12:00:00.000Z',
        collision_pair_count_live: 125,
      }),
      false,
    );
  });

  it('shouldPreferWatchdogAffectedBlockSnapshot rejects stale watchdog snapshot even when sets match', () => {
    const witness = loadWitnessFromFile(WITNESS_PATH);
    const table = loadResolutionTableFromFile(TABLE_PATH);
    const seals = buildFixtureSealsFromWitness(witness, table);
    const stored = buildAffectedBlockSnapshotFromSeals({
      seals,
      operator_cycle: 'C-370',
      audited_at: '2026-08-01T00:00:00.000Z',
    });
    const derived = buildAffectedBlockSnapshotFromSeals({
      seals,
      operator_cycle: 'C-403',
      audited_at: '2026-08-14T12:00:00.000Z',
    });

    assert.equal(
      shouldPreferWatchdogAffectedBlockSnapshot({
        stored,
        derived,
        capture_observed_at: '2026-08-14T12:00:00.000Z',
        collision_pair_count_live: 125,
      }),
      false,
    );
  });

  it('buildAffectedBlockSnapshotFromSeals persists cleared snapshot shape when no collisions', () => {
    const witness = loadWitnessFromFile(WITNESS_PATH);
    const table = loadResolutionTableFromFile(TABLE_PATH);
    const seals = buildFixtureSealsFromWitness(witness, table).filter((s) => s.status !== 'attested');
    const cleared = buildAffectedBlockSnapshotFromSeals({
      seals,
      operator_cycle: 'C-403',
      audited_at: '2026-08-14T13:00:00.000Z',
    });

    assert.deepEqual(cleared.affected_block_numbers, []);
    assert.equal(cleared.hash_divergent_pair_count, 0);
    assert.equal(cleared.schema_version, '1.0');
  });

  it('validateCompletePrimarySealReads rejects partial chunk transport failures', () => {
    const witness = loadWitnessFromFile(WITNESS_PATH);
    const table = loadResolutionTableFromFile(TABLE_PATH);
    const seals = buildFixtureSealsFromWitness(witness, table);
    const expected_ids = seals.map((seal) => seal.seal_id).slice(0, 4);
    const batch: PrimarySealBatchRead = {
      reads: expected_ids.slice(0, 2).map((seal_id) => ({
        seal_id,
        seal: seals.find((seal) => seal.seal_id === seal_id) ?? null,
        provenance: 'primary' as const,
      })),
      chunk_errors: ['primary MGET chunk offset 2 size 2 failed: transport error'],
    };

    const validated = validateCompletePrimarySealReads({ expected_ids, batch });
    assert.equal(validated.ok, false);
    assert.ok(validated.errors.some((error) => error.includes('chunk offset 2')));
    assert.ok(
      validated.errors.some((error) => error.includes('incomplete seal hydration: 2/4')),
    );
  });

  it('validateCompletePrimarySealReads rejects any missing indexed seal body', () => {
    const batch: PrimarySealBatchRead = {
      reads: [
        {
          seal_id: 'seal-a',
          seal: { seal_id: 'seal-a' } as never,
          provenance: 'primary',
        },
        { seal_id: 'seal-b', seal: null, provenance: 'missing' },
      ],
      chunk_errors: [],
    };

    const validated = validateCompletePrimarySealReads({
      expected_ids: ['seal-a', 'seal-b'],
      batch,
    });
    assert.equal(validated.ok, false);
    assert.ok(validated.errors.some((error) => error.includes('1/2')));
  });
});
