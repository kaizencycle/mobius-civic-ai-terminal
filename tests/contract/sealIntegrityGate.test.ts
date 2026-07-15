// C-372: seal integrity gate for critical block_number_collisions.
// Run: tsx tests/contract/sealIntegrityGate.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { KvWatchdogFinding } from '@/lib/watchdog/kvHealthChecks';
import {
  isSealIntegrityGateEnabled,
  sealIntegrityGatePassVerdict,
  sealIntegrityGateRationale,
  shouldSealIntegrityGateBeActive,
  type SealIntegrityGateState,
} from '@/lib/watchdog/sealIntegrityGate';

const collisionCritical: KvWatchdogFinding = {
  check: 'block_number_collisions',
  severity: 'critical',
  ok: false,
  message: '2 hash-divergent block_number collision(s) in attested KV',
};

const collisionOk: KvWatchdogFinding = {
  check: 'block_number_collisions',
  severity: 'ok',
  ok: true,
  message: 'No block_number collisions',
};

describe('sealIntegrityGate', () => {
  it('isSealIntegrityGateEnabled defaults on and respects SEAL_INTEGRITY_GATE=off', () => {
    const prior = process.env.SEAL_INTEGRITY_GATE;
    delete process.env.SEAL_INTEGRITY_GATE;
    assert.strictEqual(isSealIntegrityGateEnabled(), true);
    process.env.SEAL_INTEGRITY_GATE = 'off';
    assert.strictEqual(isSealIntegrityGateEnabled(), false);
    process.env.SEAL_INTEGRITY_GATE = prior;
  });

  it('live report clears stale alert when collisions are resolved', () => {
    const resolved = shouldSealIntegrityGateBeActive(
      { findings: [collisionOk] },
      { at: '2026-07-14T10:00:00Z', cycle: 'C-372', findings: [collisionCritical] },
    );
    assert.strictEqual(resolved.active, false);
    assert.strictEqual(resolved.source, 'live-report');
  });

  it('stale alert activates gate when no live report exists', () => {
    const active = shouldSealIntegrityGateBeActive(null, {
      at: '2026-07-14T10:00:00Z',
      cycle: 'C-372',
      findings: [collisionCritical],
    });
    assert.strictEqual(active.active, true);
    assert.strictEqual(active.source, 'stale-alert');
  });

  it('sealIntegrityGatePassVerdict returns flag only when gate active', () => {
    const on: SealIntegrityGateState = {
      active: true,
      enabled: true,
      reasons: ['bad'],
      alert_at: null,
      operator_cycle: 'C-372',
      source: 'live-report',
    };
    const off: SealIntegrityGateState = { ...on, active: false, source: 'none' };
    assert.strictEqual(sealIntegrityGatePassVerdict(on), 'flag');
    assert.strictEqual(sealIntegrityGatePassVerdict(off), 'pass');
  });

  it('sealIntegrityGateRationale references active collision context', () => {
    const state: SealIntegrityGateState = {
      active: true,
      enabled: true,
      reasons: ['2 hash-divergent block_number collision(s) in attested KV'],
      alert_at: '2026-07-14T15:00:00.000Z',
      operator_cycle: 'C-372',
      source: 'live-report',
    };
    const text = sealIntegrityGateRationale(state);
    assert.match(text, /block_number/);
    assert.match(text, /EPICON_C-372/);
  });

  it('critical collision keeps gate active; resolved live report releases gate', () => {
    const active = shouldSealIntegrityGateBeActive({ findings: [collisionCritical] }, null);
    assert.strictEqual(active.active, true);

    const released = shouldSealIntegrityGateBeActive({ findings: [collisionOk] }, {
      at: '2026-07-14T10:00:00Z',
      cycle: 'C-373',
      findings: [collisionCritical],
    });
    assert.strictEqual(released.active, false);
    assert.strictEqual(released.source, 'live-report');
  });

  it('stale critical alert cannot override clean live report', () => {
    const resolved = shouldSealIntegrityGateBeActive(
      { findings: [collisionOk] },
      { at: '2026-07-14T10:00:00Z', cycle: 'C-373', findings: [collisionCritical] },
    );
    assert.strictEqual(resolved.active, false);
    assert.strictEqual(resolved.source, 'live-report');
  });

  it('gate override remains explicit via SEAL_INTEGRITY_GATE=off', () => {
    const prior = process.env.SEAL_INTEGRITY_GATE;
    process.env.SEAL_INTEGRITY_GATE = 'off';
    assert.strictEqual(isSealIntegrityGateEnabled(), false);
    process.env.SEAL_INTEGRITY_GATE = prior;
  });
});
