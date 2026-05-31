// tests/contract/shardConfig.test.ts
// C-326 / OPT-20 (corrected): a real contract test, not a tautology.
//
// Parses the vendored canon yaml independently and asserts that every exported
// constant in shardConfig.ts equals the parsed canon. The yaml is the source
// of truth; the .ts is proven to be a faithful projection of it.
//
// Run: tsx tests/contract/shardConfig.test.ts

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  CANONICAL_MII_THRESHOLD,
  OPERATOR_MII_THRESHOLD,
  CANONICAL_SHARD_WEIGHTS,
  CANONICAL_MIN_SCORES,
  CANONICAL_PER_CYCLE_CAPS,
  getEffectiveMiiThreshold,
  isThresholdBelowCanon,
} from '../../lib/integrity/shardConfig.js';

const canonRaw = readFileSync(
  join(process.cwd(), 'lib', 'integrity', 'canon', 'kaizen_shards.yaml'),
  'utf8',
);
const canon = parse(canonRaw) as {
  threshold_mii: number;
  shard_weights: Record<string, number>;
  min_scores: Record<string, number>;
  caps: { per_cycle: Record<string, number> };
};

describe('shardConfig is a faithful projection of vendored canon', () => {
  it('CANONICAL_MII_THRESHOLD equals canon threshold_mii', () => {
    assert.strictEqual(CANONICAL_MII_THRESHOLD, canon.threshold_mii);
  });

  it('CANONICAL_SHARD_WEIGHTS equals canon shard_weights exactly', () => {
    assert.deepStrictEqual(
      { ...CANONICAL_SHARD_WEIGHTS },
      { ...canon.shard_weights },
      'shard weights drifted from canon/kaizen_shards.yaml',
    );
  });

  it('CANONICAL_MIN_SCORES equals canon min_scores', () => {
    assert.deepStrictEqual({ ...CANONICAL_MIN_SCORES }, { ...canon.min_scores });
  });

  it('CANONICAL_PER_CYCLE_CAPS equals canon caps.per_cycle', () => {
    assert.deepStrictEqual({ ...CANONICAL_PER_CYCLE_CAPS }, { ...canon.caps.per_cycle });
  });

  it('no shard weight is silently zero or negative', () => {
    for (const [k, v] of Object.entries(CANONICAL_SHARD_WEIGHTS)) {
      assert.ok(v > 0, `shard weight ${k} must be > 0, got ${v}`);
    }
  });
});

describe('operator threshold is an attributed deviation, not a hidden fork', () => {
  after(() => {
    delete process.env.MII_THRESHOLD_OVERRIDE;
  });

  it('operator threshold is 0.88 per C-296', () => {
    assert.strictEqual(OPERATOR_MII_THRESHOLD, 0.88);
  });

  it('operator threshold sits below canon', () => {
    assert.ok(
      OPERATOR_MII_THRESHOLD < CANONICAL_MII_THRESHOLD,
      'operator threshold should be below canon; if not, drop the override',
    );
  });

  it('effective threshold defaults to operator value', () => {
    delete process.env.MII_THRESHOLD_OVERRIDE;
    assert.strictEqual(getEffectiveMiiThreshold(), OPERATOR_MII_THRESHOLD);
  });

  it('isThresholdBelowCanon() is true under the operator default', () => {
    delete process.env.MII_THRESHOLD_OVERRIDE;
    assert.strictEqual(isThresholdBelowCanon(), true);
  });

  it('env override is respected when valid and within (0,1]', () => {
    process.env.MII_THRESHOLD_OVERRIDE = '0.92';
    assert.strictEqual(getEffectiveMiiThreshold(), 0.92);
    delete process.env.MII_THRESHOLD_OVERRIDE;
  });

  it('invalid override is ignored (falls back to operator)', () => {
    process.env.MII_THRESHOLD_OVERRIDE = 'not-a-number';
    assert.strictEqual(getEffectiveMiiThreshold(), OPERATOR_MII_THRESHOLD);
    delete process.env.MII_THRESHOLD_OVERRIDE;
    process.env.MII_THRESHOLD_OVERRIDE = '1.5';
    assert.strictEqual(getEffectiveMiiThreshold(), OPERATOR_MII_THRESHOLD);
    delete process.env.MII_THRESHOLD_OVERRIDE;
  });
});
