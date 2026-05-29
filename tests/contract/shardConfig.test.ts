import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_MII_THRESHOLD,
  OPERATOR_MII_THRESHOLD,
  CANONICAL_SHARD_WEIGHTS,
  getEffectiveMiiThreshold,
} from '../../lib/integrity/shardConfig.js';

describe('shardConfig canonical values', () => {
  after(() => {
    delete process.env.MII_THRESHOLD_OVERRIDE;
  });

  it('canonical threshold is 0.95 per MIC Whitepaper §6.1', () => {
    assert.strictEqual(CANONICAL_MII_THRESHOLD, 0.95);
  });

  it('operator threshold is 0.88 per C-296', () => {
    assert.strictEqual(OPERATOR_MII_THRESHOLD, 0.88);
  });

  it('effective threshold defaults to operator value when no override', () => {
    delete process.env.MII_THRESHOLD_OVERRIDE;
    assert.strictEqual(getEffectiveMiiThreshold(), 0.88);
  });

  it('env override is respected when valid', () => {
    process.env.MII_THRESHOLD_OVERRIDE = '0.92';
    assert.strictEqual(getEffectiveMiiThreshold(), 0.92);
    delete process.env.MII_THRESHOLD_OVERRIDE;
  });

  it('shard weights match canonical spec', () => {
    assert.strictEqual(CANONICAL_SHARD_WEIGHTS.reflection, 1.0);
    assert.strictEqual(CANONICAL_SHARD_WEIGHTS.learning, 1.0);
    assert.strictEqual(CANONICAL_SHARD_WEIGHTS.civic, 1.5);
    assert.strictEqual(CANONICAL_SHARD_WEIGHTS.stability, 2.0);
    assert.strictEqual(CANONICAL_SHARD_WEIGHTS.stewardship, 2.0);
    assert.strictEqual(CANONICAL_SHARD_WEIGHTS.innovation, 2.5);
    assert.strictEqual(CANONICAL_SHARD_WEIGHTS.guardian, 3.0);
  });

  it('guardian shard has highest weight (protocol integrity)', () => {
    const max = Math.max(...Object.values(CANONICAL_SHARD_WEIGHTS));
    assert.strictEqual(CANONICAL_SHARD_WEIGHTS.guardian, max);
  });
});
