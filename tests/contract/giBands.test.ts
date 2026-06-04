// tests/contract/giBands.test.ts
// C-328: Verify canonical GI band thresholds and posture logic.
// Run: tsx tests/contract/giBands.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GI_BANDS, GI_POSTURE_BANDS, getGiMode, getSealingPosture } from '../../lib/gi/bands.js';

describe('GI_BANDS canonical thresholds', () => {
  it('green threshold is 0.80', () => {
    assert.strictEqual(GI_BANDS.green, 0.80);
  });

  it('yellow threshold is 0.60', () => {
    assert.strictEqual(GI_BANDS.yellow, 0.60);
  });
});

describe('getGiMode', () => {
  it('0.80 is green', () => assert.strictEqual(getGiMode(0.80), 'green'));
  it('0.79 is yellow', () => assert.strictEqual(getGiMode(0.79), 'yellow'));
  it('0.60 is yellow', () => assert.strictEqual(getGiMode(0.60), 'yellow'));
  it('0.59 is red', () => assert.strictEqual(getGiMode(0.59), 'red'));
  it('1.00 is green', () => assert.strictEqual(getGiMode(1.00), 'green'));
  it('0.00 is red', () => assert.strictEqual(getGiMode(0.00), 'red'));
});

describe('getSealingPosture', () => {
  it('gi=0.80 green → confident', () => {
    assert.strictEqual(getSealingPosture(0.80, 'green'), 'confident');
  });

  it('gi=0.74 yellow → cautionary', () => {
    assert.strictEqual(getSealingPosture(0.74, 'yellow'), 'cautionary');
  });

  it('gi=0.60 yellow → stressed', () => {
    assert.strictEqual(getSealingPosture(0.60, 'yellow'), 'stressed');
  });

  it('gi=0.50 red → degraded', () => {
    assert.strictEqual(getSealingPosture(0.50, 'red'), 'degraded');
  });

  it('gi=0.79 yellow (below confident threshold) → cautionary', () => {
    assert.strictEqual(getSealingPosture(0.79, 'yellow'), 'cautionary');
  });
});
