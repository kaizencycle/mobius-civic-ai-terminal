// C-373: kv-watchdog HTTP outcome — distinguish integrity 409 from infra 503.
// Run: tsx tests/contract/kvWatchdogHttpOutcome.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { KvWatchdogReport } from '@/lib/watchdog/kvHealthChecks';
import { resolveKvWatchdogHttpOutcome } from '@/lib/watchdog/kvWatchdogHttpOutcome';

function baseReport(overrides: Partial<KvWatchdogReport>): KvWatchdogReport {
  return {
    checked_at: new Date().toISOString(),
    findings: [],
    max_severity: 'ok',
    primary_kv_suspended: false,
    seals_skipped: false,
    ...overrides,
  };
}

describe('kvWatchdogHttpOutcome', () => {
  it('returns 409 integrity_blocked for hash-divergent collisions when checks complete', () => {
    const report = baseReport({
      max_severity: 'critical',
      findings: [
        {
          check: 'block_number_collisions',
          severity: 'critical',
          ok: false,
          message: '125 hash-divergent block_number collision(s) in attested KV',
          evidence: { hash_divergent_collisions: 125 },
        },
      ],
    });
    const http = resolveKvWatchdogHttpOutcome({
      report,
      sealGate: { active: true },
    });
    assert.strictEqual(http.outcome, 'integrity_blocked');
    assert.strictEqual(http.http_status, 409);
    assert.strictEqual(http.collision_count, 125);
    assert.strictEqual(http.checks_complete, true);
    assert.strictEqual(http.hard_stop_enabled, true);
  });

  it('returns 503 check_incomplete when seal chain checks were skipped', () => {
    const report = baseReport({
      max_severity: 'critical',
      primary_kv_suspended: true,
      seals_skipped: true,
      findings: [
        {
          check: 'kv_budget_suspension',
          severity: 'critical',
          ok: false,
          message: 'Primary KV suspended (health ping)',
        },
      ],
    });
    const http = resolveKvWatchdogHttpOutcome({
      report,
      sealGate: { active: true },
    });
    assert.strictEqual(http.outcome, 'check_incomplete');
    assert.strictEqual(http.http_status, 503);
    assert.strictEqual(http.collision_count, null);
    assert.strictEqual(http.checks_complete, false);
  });

  it('returns 503 critical_infra for non-collision critical findings', () => {
    const report = baseReport({
      max_severity: 'critical',
      findings: [
        {
          check: 'kv_write_canary',
          severity: 'critical',
          ok: false,
          message: 'KV canary write did not round-trip',
        },
      ],
    });
    const http = resolveKvWatchdogHttpOutcome({
      report,
      sealGate: { active: false },
    });
    assert.strictEqual(http.outcome, 'critical_infra');
    assert.strictEqual(http.http_status, 503);
  });

  it('keeps 409 for integrity block even when escalation dependencies degraded', () => {
    const report = baseReport({
      max_severity: 'critical',
      findings: [
        {
          check: 'block_number_collisions',
          severity: 'critical',
          ok: false,
          message: '6 hash-divergent block_number collision(s) in attested KV',
          evidence: { hash_divergent_collisions: 6 },
        },
      ],
    });
    const http = resolveKvWatchdogHttpOutcome({
      report,
      sealGate: { active: true },
      degradedDependencies: [
        {
          dependency: 'eve_journal',
          error: '[identity-token] login network error: The operation was aborted due to timeout',
        },
      ],
    });
    assert.strictEqual(http.outcome, 'integrity_blocked');
    assert.strictEqual(http.http_status, 409);
    assert.strictEqual(http.degraded_dependencies.length, 1);
  });

  it('returns 207 when checks ok but identity escalation failed', () => {
    const report = baseReport({ max_severity: 'ok' });
    const http = resolveKvWatchdogHttpOutcome({
      report,
      sealGate: { active: false },
      degradedDependencies: [
        { dependency: 'eve_journal', error: 'identity login timeout' },
      ],
    });
    assert.strictEqual(http.outcome, 'ok');
    assert.strictEqual(http.http_status, 207);
  });
});
