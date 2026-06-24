// OPT-01(C-352): Contract test for GI cross-verification against backup Redis mirror.
// Tests the pure computeGiVerification helper in isolation (no live infra required).
//
// Run: tsx tests/contract/giVerification.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeGiVerification } from '../../app/api/terminal/snapshot-lite/route.js';

describe('GI cross-verification against backup Redis mirror', () => {
  it('matching KV and mirror values → gi_verified true', () => {
    const result = computeGiVerification(0.785, 0.785, false);
    assert.strictEqual(result.gi_verified, true);
    assert.strictEqual(result.gi_conflict, undefined);
    assert.strictEqual(result.gi_mirror_error, undefined);
  });

  it('values within 0.01 tolerance → gi_verified true', () => {
    const result = computeGiVerification(0.785, 0.790, false);
    assert.strictEqual(result.gi_verified, true);
    assert.ok(result.gi_mirror_delta !== undefined && result.gi_mirror_delta < 0.01);
  });

  it('values diverging by ≥0.01 → gi_conflict true, gi_verified false', () => {
    const result = computeGiVerification(0.785, 0.700, false);
    assert.strictEqual(result.gi_verified, false);
    assert.strictEqual(result.gi_conflict, true);
    assert.ok(result.gi_mirror_delta !== undefined && result.gi_mirror_delta >= 0.01);
  });

  it('mirror read error → gi_mirror_error true, gi_verified false', () => {
    const result = computeGiVerification(0.785, null, true);
    assert.strictEqual(result.gi_verified, false);
    assert.strictEqual(result.gi_mirror_error, true);
  });

  it('null primary GI → gi_verified false, no conflict', () => {
    const result = computeGiVerification(null, 0.785, false);
    assert.strictEqual(result.gi_verified, false);
    assert.strictEqual(result.gi_conflict, undefined);
  });
});
