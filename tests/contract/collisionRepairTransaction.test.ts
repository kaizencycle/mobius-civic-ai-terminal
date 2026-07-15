// C-373: collision repair transaction invariants
// Run: tsx tests/contract/collisionRepairTransaction.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLISION_REPAIR_TX_SCRIPT,
  quarantineWitness,
  type PreparedCollisionRepair,
} from '@/lib/watchdog/collisionRepairTransaction';
import { CAS_NULL_SENTINEL, LATEST_SEAL_KEY } from '@/lib/vault-v2/latestSealCas';

type TxEval = (script: string, keys: string[], args: string[]) => Promise<[number, string, string?]>;

function createTransactionRedis(initial: {
  canonical_block?: string | null;
  quarantine?: string[];
  latest?: string | null;
}): { store: Map<string, string>; eval: TxEval } {
  const store = new Map<string, string>();
  const blockKey = 'mobius:watchdog:canonical:block:1';
  const quarKey = 'mobius:watchdog:canonical:quarantined';
  if (initial.canonical_block) store.set(blockKey, initial.canonical_block);
  if (initial.quarantine && initial.quarantine.length > 0) {
    store.set(quarKey, JSON.stringify([...initial.quarantine].sort()));
  }
  if (initial.latest) store.set(LATEST_SEAL_KEY, initial.latest);

  const evalFn: TxEval = async (script, keys, args) => {
    assert.equal(script, COLLISION_REPAIR_TX_SCRIPT);
    const curBlock = store.get(keys[0]) ?? null;
    const curQuar = store.get(keys[1]) ?? null;
    const curLatest = store.get(keys[2]) ?? null;

    const [expBlock, nextBlock, expQuar, nextQuar, expLatest, nextLatest] = args;

    if (expBlock === CAS_NULL_SENTINEL) {
      if (curBlock !== null) return [0, 'canonical_block', curBlock];
    } else if (curBlock !== expBlock) {
      return [0, 'canonical_block', curBlock ?? ''];
    }

    const curQuarWitness = curQuar ?? CAS_NULL_SENTINEL;
    if (expQuar !== curQuarWitness) return [0, 'quarantine', curQuarWitness];

    if (expLatest === CAS_NULL_SENTINEL) {
      if (curLatest !== null) return [0, 'latest_pointer', curLatest];
    } else if (curLatest !== expLatest) {
      return [0, 'latest_pointer', curLatest ?? ''];
    }

    store.set(keys[0], nextBlock);
    store.set(keys[1], nextQuar);
    store.set(keys[2], nextLatest);
    return [1, 'committed'];
  };

  return { store, eval: evalFn };
}

function samplePlan(overrides?: Partial<PreparedCollisionRepair>): PreparedCollisionRepair {
  return {
    receipt_id: 'rcpt-test',
    block_number: 1,
    expected: {
      canonical_block: null,
      latest_pointer: null,
      quarantine_witness: CAS_NULL_SENTINEL,
    },
    next: {
      canonical_block: 'keep',
      quarantine_ids: ['drop'],
      latest_pointer: 'keep',
    },
    before: {
      canonical_block: null,
      quarantine: [],
      latest_pointer: null,
    },
    already_applied: false,
    ...overrides,
  };
}

describe('collisionRepairTransaction', () => {
  it('quarantineWitness uses null sentinel for empty list', () => {
    assert.equal(quarantineWitness([]), CAS_NULL_SENTINEL);
    assert.notEqual(quarantineWitness(['b', 'a']), CAS_NULL_SENTINEL);
  });

  it('atomic transaction updates all derived state together', async () => {
    const redis = createTransactionRedis({});
    const plan = samplePlan();
    const result = await redis.eval(COLLISION_REPAIR_TX_SCRIPT, [
      'mobius:watchdog:canonical:block:1',
      'mobius:watchdog:canonical:quarantined',
      LATEST_SEAL_KEY,
    ], [
      CAS_NULL_SENTINEL,
      plan.next.canonical_block,
      plan.expected.quarantine_witness,
      quarantineWitness(plan.next.quarantine_ids),
      CAS_NULL_SENTINEL,
      plan.next.latest_pointer,
    ]);
    assert.deepEqual(result, [1, 'committed']);
    assert.equal(redis.store.get('mobius:watchdog:canonical:block:1'), 'keep');
    assert.equal(redis.store.get(LATEST_SEAL_KEY), 'keep');
  });

  it('precondition mismatch produces no writes', async () => {
    const redis = createTransactionRedis({ latest: 'stale' });
    const plan = samplePlan({
      expected: { canonical_block: null, latest_pointer: null, quarantine_witness: CAS_NULL_SENTINEL },
    });
    const result = await redis.eval(COLLISION_REPAIR_TX_SCRIPT, [
      'mobius:watchdog:canonical:block:1',
      'mobius:watchdog:canonical:quarantined',
      LATEST_SEAL_KEY,
    ], [
      CAS_NULL_SENTINEL,
      plan.next.canonical_block,
      plan.expected.quarantine_witness,
      quarantineWitness(plan.next.quarantine_ids),
      CAS_NULL_SENTINEL,
      plan.next.latest_pointer,
    ]);
    assert.equal(result[0], 0);
    assert.equal(redis.store.get('mobius:watchdog:canonical:block:1'), undefined);
    assert.equal(redis.store.get(LATEST_SEAL_KEY), 'stale');
  });
});
