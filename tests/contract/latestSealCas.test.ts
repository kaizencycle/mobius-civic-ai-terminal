// C-373: atomic latest-seal CAS invariants
// Run: tsx tests/contract/latestSealCas.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Redis } from '@upstash/redis';
import {
  CAS_NULL_SENTINEL,
  LATEST_SEAL_CAS_SCRIPT,
  LATEST_SEAL_KEY,
  compareAndSetLatestSealIdOnRedis,
} from '@/lib/vault-v2/latestSealCas';

type EvalFn = (
  script: string,
  keys: string[],
  args: string[],
) => Promise<[number, string] | null>;

function asEvalRedis(redis: { eval: EvalFn }): Pick<Redis, 'eval'> {
  return redis as unknown as Pick<Redis, 'eval'>;
}

function createAtomicCasRedis(initial: Record<string, string> = {}): {
  store: Map<string, string>;
  eval: EvalFn;
  mirrorUpdated: boolean;
} {
  const store = new Map<string, string>(Object.entries(initial));
  let mirrorUpdated = false;

  const evalFn: EvalFn = async (script, keys, args) => {
    assert.equal(script, LATEST_SEAL_CAS_SCRIPT);
    const key = keys[0];
    const [expectedArg, next] = args;
    const current = store.get(key) ?? null;

    if (expectedArg === CAS_NULL_SENTINEL) {
      if (current !== null) return [0, current];
    } else if (current !== expectedArg) {
      return [0, current ?? ''];
    }

    store.set(key, next);
    mirrorUpdated = true;
    return [1, next];
  };

  return {
    store,
    eval: evalFn,
    get mirrorUpdated() {
      return mirrorUpdated;
    },
    set mirrorUpdated(v: boolean) {
      mirrorUpdated = v;
    },
  };
}

describe('latestSealCas', () => {
  it('matching expected pointer succeeds', async () => {
    const redis = createAtomicCasRedis({ [LATEST_SEAL_KEY]: 'seal-a' });
    const result = await compareAndSetLatestSealIdOnRedis(asEvalRedis(redis), 'seal-a', 'seal-b');
    assert.equal(result.ok, true);
    assert.equal(result.actual, 'seal-b');
    assert.equal(redis.store.get(LATEST_SEAL_KEY), 'seal-b');
  });

  it('mismatched expected pointer fails without write', async () => {
    const redis = createAtomicCasRedis({ [LATEST_SEAL_KEY]: 'seal-a' });
    const result = await compareAndSetLatestSealIdOnRedis(asEvalRedis(redis), 'seal-z', 'seal-b');
    assert.equal(result.ok, false);
    assert.equal(result.actual, 'seal-a');
    assert.equal(redis.store.get(LATEST_SEAL_KEY), 'seal-a');
  });

  it('expected null succeeds only when absent', async () => {
    const redis = createAtomicCasRedis();
    const result = await compareAndSetLatestSealIdOnRedis(asEvalRedis(redis), null, 'seal-first');
    assert.equal(result.ok, true);
    assert.equal(redis.store.get(LATEST_SEAL_KEY), 'seal-first');
  });

  it('expected null fails when pointer exists', async () => {
    const redis = createAtomicCasRedis({ [LATEST_SEAL_KEY]: 'seal-a' });
    const result = await compareAndSetLatestSealIdOnRedis(asEvalRedis(redis), null, 'seal-b');
    assert.equal(result.ok, false);
    assert.equal(result.actual, 'seal-a');
  });

  it('two concurrent callers with same expected cannot both succeed', async () => {
    const redis = createAtomicCasRedis({ [LATEST_SEAL_KEY]: 'seal-a' });
    const [r1, r2] = await Promise.all([
      compareAndSetLatestSealIdOnRedis(asEvalRedis(redis), 'seal-a', 'seal-b'),
      compareAndSetLatestSealIdOnRedis(asEvalRedis(redis), 'seal-a', 'seal-c'),
    ]);
    const successes = [r1, r2].filter((r) => r.ok);
    assert.equal(successes.length, 1);
    const final = redis.store.get(LATEST_SEAL_KEY);
    assert.ok(final === 'seal-b' || final === 'seal-c');
  });
});
