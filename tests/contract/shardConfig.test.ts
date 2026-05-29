import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CANONICAL_MII_THRESHOLD,
  OPERATOR_MII_THRESHOLD,
  CANONICAL_SHARD_WEIGHTS,
  getEffectiveMiiThreshold,
} from '@/lib/integrity/shardConfig';

describe('shardConfig canonical values', () => {
  afterEach(() => {
    delete process.env.MII_THRESHOLD_OVERRIDE;
  });

  it('canonical threshold is 0.95 per MIC Whitepaper §6.1', () => {
    expect(CANONICAL_MII_THRESHOLD).toBe(0.95);
  });

  it('operator threshold is 0.88 per C-296', () => {
    expect(OPERATOR_MII_THRESHOLD).toBe(0.88);
  });

  it('effective threshold defaults to operator value when no override', () => {
    delete process.env.MII_THRESHOLD_OVERRIDE;
    expect(getEffectiveMiiThreshold()).toBe(0.88);
  });

  it('env override is respected when valid', () => {
    process.env.MII_THRESHOLD_OVERRIDE = '0.92';
    expect(getEffectiveMiiThreshold()).toBe(0.92);
  });

  it('shard weights match canonical spec', () => {
    expect(CANONICAL_SHARD_WEIGHTS.reflection).toBe(1.0);
    expect(CANONICAL_SHARD_WEIGHTS.learning).toBe(1.0);
    expect(CANONICAL_SHARD_WEIGHTS.civic).toBe(1.5);
    expect(CANONICAL_SHARD_WEIGHTS.stability).toBe(2.0);
    expect(CANONICAL_SHARD_WEIGHTS.stewardship).toBe(2.0);
    expect(CANONICAL_SHARD_WEIGHTS.innovation).toBe(2.5);
    expect(CANONICAL_SHARD_WEIGHTS.guardian).toBe(3.0);
  });

  it('guardian shard has highest weight (protocol integrity)', () => {
    const max = Math.max(...Object.values(CANONICAL_SHARD_WEIGHTS));
    expect(CANONICAL_SHARD_WEIGHTS.guardian).toBe(max);
  });
});
