// C-372: seal integrity gate for critical block_number_collisions.
// Run: tsx tests/contract/sealIntegrityGate.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSealIntegrityGateEnabled,
  sealIntegrityGateRationale,
  type SealIntegrityGateState,
} from '@/lib/watchdog/sealIntegrityGate';

describe('sealIntegrityGate', () => {
  it('isSealIntegrityGateEnabled defaults on and respects SEAL_INTEGRITY_GATE=off', () => {
    const prior = process.env.SEAL_INTEGRITY_GATE;
    delete process.env.SEAL_INTEGRITY_GATE;
    assert.strictEqual(isSealIntegrityGateEnabled(), true);
    process.env.SEAL_INTEGRITY_GATE = 'off';
    assert.strictEqual(isSealIntegrityGateEnabled(), false);
    process.env.SEAL_INTEGRITY_GATE = prior;
  });

  it('sealIntegrityGateRationale references active collision context', () => {
    const state: SealIntegrityGateState = {
      active: true,
      enabled: true,
      reasons: ['2 hash-divergent block_number collision(s) in attested KV'],
      alert_at: '2026-07-14T15:00:00.000Z',
      operator_cycle: 'C-372',
    };
    const text = sealIntegrityGateRationale(state);
    assert.match(text, /block_number/);
    assert.match(text, /EPICON_C-372/);
  });
});
