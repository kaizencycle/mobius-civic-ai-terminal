/**
 * EVE KV/Upstash watchdog checks — C-370.
 * EPICON: EPICON_C-370_EVE_kv-watchdog-implementation_v1
 */

import { analyzeReserveBlockCollisions } from '@/lib/dat/reserveBlockCollisions';
import { isBudgetSuspensionError } from '@/lib/substrate/kv-errors';
import { kvGet, kvGetOrThrow, kvHealth, kvSet, kvSetOrThrow } from '@/lib/kv/store';
import { getLatestSeal, getLatestSealId, listAllSeals } from '@/lib/vault-v2/store';
import type { Seal } from '@/lib/vault-v2/types';

export const WATCHDOG_CANARY_KEY = 'watchdog:kv:canary';
export const WATCHDOG_STATE_KEY = 'watchdog:kv:last-report';
export const WATCHDOG_CRITICAL_ALERT_KEY = 'watchdog:kv:critical-alert';

/**
 * Lineage audit (C-370): active-cycle seals roughly every 4–8h; 36h threshold
 * allows multi-cycle gaps without dominating on quiet weekends.
 */
export const LATEST_SEAL_STALENESS_MS = 36 * 60 * 60 * 1000;

/** Jun 30 re-attest cluster peaked at 283 seals/hour. */
export const REATTEST_HOURLY_SPIKE_THRESHOLD = 100;
export const REATTEST_HOURLY_CRITICAL_THRESHOLD = 200;

export type WatchdogSeverity = 'ok' | 'informational' | 'warning' | 'critical';

export type KvWatchdogCheckId =
  | 'kv_budget_suspension'
  | 'kv_write_canary'
  | 'latest_seal_key_present'
  | 'latest_seal_key_freshness'
  | 'latest_seal_key_consistency'
  | 'block_number_collisions'
  | 'reattest_attestation_spike';

export interface KvWatchdogFinding {
  check: KvWatchdogCheckId;
  severity: WatchdogSeverity;
  ok: boolean;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface KvWatchdogReport {
  checked_at: string;
  findings: KvWatchdogFinding[];
  max_severity: WatchdogSeverity;
  primary_kv_suspended: boolean;
  seals_skipped: boolean;
}

export const SEVERITY_RANK: Record<WatchdogSeverity, number> = {
  ok: 0,
  informational: 1,
  warning: 2,
  critical: 3,
};

export function maxSeverity(findings: KvWatchdogFinding[]): WatchdogSeverity {
  let max: WatchdogSeverity = 'ok';
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[max]) {
      max = f.severity;
    }
  }
  return max;
}

function mk(
  check: KvWatchdogCheckId,
  severity: WatchdogSeverity,
  ok: boolean,
  message: string,
  evidence?: Record<string, unknown>,
): KvWatchdogFinding {
  return { check, severity, ok, message, evidence };
}

async function checkKvBudgetSuspension(): Promise<{ finding: KvWatchdogFinding; suspended: boolean }> {
  const health = await kvHealth();
  if (!health.configured) {
    return {
      suspended: false,
      finding: mk('kv_budget_suspension', 'warning', false, 'KV not configured', { health }),
    };
  }
  if (health.error && isBudgetSuspensionError(new Error(health.error))) {
    return {
      suspended: true,
      finding: mk('kv_budget_suspension', 'critical', false, 'Primary KV suspended (health ping)', {
        error: health.error,
      }),
    };
  }
  if (!health.available) {
    return {
      suspended: false,
      finding: mk('kv_budget_suspension', 'warning', false, 'KV health ping failed', { error: health.error }),
    };
  }
  return {
    suspended: false,
    finding: mk('kv_budget_suspension', 'ok', true, 'KV health ping OK', { latencyMs: health.latencyMs }),
  };
}

async function checkKvWriteCanary(): Promise<{ finding: KvWatchdogFinding; suspended: boolean }> {
  const token = `canary-${Date.now()}`;
  try {
    await kvSetOrThrow(WATCHDOG_CANARY_KEY, { token, at: new Date().toISOString() }, 3600);
    const read = await kvGetOrThrow<{ token: string }>(WATCHDOG_CANARY_KEY);
    if (read?.token !== token) {
      return {
        suspended: false,
        finding: mk(
          'kv_write_canary',
          'critical',
          false,
          'KV canary write did not round-trip (possible silent write failure on primary path)',
          { expected: token, got: read?.token ?? null },
        ),
      };
    }
    return {
      suspended: false,
      finding: mk('kv_write_canary', 'ok', true, 'KV canary write/read OK'),
    };
  } catch (err) {
    if (isBudgetSuspensionError(err)) {
      return {
        suspended: true,
        finding: mk('kv_write_canary', 'critical', false, 'KV canary write failed — budget suspension', {
          error: err instanceof Error ? err.message : String(err),
        }),
      };
    }
    return {
      suspended: false,
      finding: mk('kv_write_canary', 'warning', false, 'KV canary write failed (non-budget)', {
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}

function newestAttestedSeal(seals: Seal[]): Seal | null {
  const attested = seals.filter((s) => s.status === 'attested');
  if (attested.length === 0) return null;
  return attested.reduce((best, s) => (s.sealed_at > best.sealed_at ? s : best));
}

async function checkLatestSealKey(seals: Seal[]): Promise<KvWatchdogFinding[]> {
  const findings: KvWatchdogFinding[] = [];
  const latestId = await getLatestSealId();
  const attestedCount = seals.filter((s) => s.status === 'attested').length;

  if (attestedCount > 0 && !latestId) {
    findings.push(
      mk(
        'latest_seal_key_present',
        'critical',
        false,
        'LATEST_SEAL_KEY missing while attested seals exist in KV',
        { attested_count: attestedCount },
      ),
    );
    return findings;
  }

  if (!latestId) {
    findings.push(mk('latest_seal_key_present', 'ok', true, 'No attested seals and no LATEST_SEAL_KEY'));
    return findings;
  }

  findings.push(mk('latest_seal_key_present', 'ok', true, 'LATEST_SEAL_KEY present', { latest_seal_id: latestId }));

  const pointed = await getLatestSeal();
  if (!pointed) {
    findings.push(
      mk(
        'latest_seal_key_consistency',
        'critical',
        false,
        'LATEST_SEAL_KEY points to missing seal record',
        { latest_seal_id: latestId },
      ),
    );
    return findings;
  }

  const newest = newestAttestedSeal(seals);
  if (newest && newest.seal_id !== latestId && newest.sealed_at > pointed.sealed_at) {
    findings.push(
      mk(
        'latest_seal_key_consistency',
        'warning',
        false,
        'LATEST_SEAL_KEY is stale relative to newest attested seal by sealed_at',
        {
          latest_seal_key: latestId,
          newest_attested: newest.seal_id,
          key_sealed_at: pointed.sealed_at,
          newest_sealed_at: newest.sealed_at,
        },
      ),
    );
  } else {
    findings.push(
      mk('latest_seal_key_consistency', 'ok', true, 'LATEST_SEAL_KEY consistent with newest attested seal'),
    );
  }

  const ageMs = Date.now() - new Date(pointed.sealed_at).getTime();
  if (ageMs > LATEST_SEAL_STALENESS_MS) {
    findings.push(
      mk(
        'latest_seal_key_freshness',
        'warning',
        false,
        `Latest seal older than staleness threshold (${Math.round(LATEST_SEAL_STALENESS_MS / 3_600_000)}h)`,
        {
          latest_seal_id: latestId,
          sealed_at: pointed.sealed_at,
          age_ms: ageMs,
          threshold_ms: LATEST_SEAL_STALENESS_MS,
        },
      ),
    );
  } else {
    findings.push(
      mk('latest_seal_key_freshness', 'ok', true, 'Latest seal within staleness threshold', { age_ms: ageMs }),
    );
  }

  return findings;
}

export function checkBlockCollisions(seals: Seal[]): KvWatchdogFinding {
  const report = analyzeReserveBlockCollisions(seals);
  const hashDivergent = report.collisions.filter((c) => c.seal_hashes_differ).length;
  if (hashDivergent > 0) {
    return mk(
      'block_number_collisions',
      'critical',
      false,
      `${hashDivergent} hash-divergent block_number collision(s) in attested KV`,
      {
        collision_count: report.collision_count,
        hash_divergent_collisions: hashDivergent,
        sample: report.collisions.slice(0, 3),
      },
    );
  }
  if (report.collision_count > 0) {
    return mk(
      'block_number_collisions',
      'warning',
      false,
      `${report.collision_count} block_number collision(s) without hash divergence`,
      { collision_count: report.collision_count },
    );
  }
  return mk('block_number_collisions', 'ok', true, 'No block_number collisions', {
    attested_count: report.raw_attested_count,
    unique_blocks: report.unique_block_count,
  });
}

export function checkReattestSpike(seals: Seal[], nowMs = Date.now()): KvWatchdogFinding {
  const oneHourAgo = nowMs - 60 * 60 * 1000;
  const count = seals.filter((s) => {
    const ts = s.substrate_attested_at ?? s.sealed_at;
    if (!ts) return false;
    return new Date(ts).getTime() >= oneHourAgo;
  }).length;

  if (count >= REATTEST_HOURLY_CRITICAL_THRESHOLD) {
    return mk(
      'reattest_attestation_spike',
      'critical',
      false,
      `Bulk re-attestation spike detected (${count} seals in last hour)`,
      { count_last_hour: count, threshold: REATTEST_HOURLY_CRITICAL_THRESHOLD },
    );
  }
  if (count >= REATTEST_HOURLY_SPIKE_THRESHOLD) {
    return mk(
      'reattest_attestation_spike',
      'warning',
      false,
      `Elevated attestation activity (${count} seals in last hour)`,
      { count_last_hour: count, threshold: REATTEST_HOURLY_SPIKE_THRESHOLD },
    );
  }
  return mk('reattest_attestation_spike', 'ok', true, 'Attestation rate within hourly threshold', {
    count_last_hour: count,
  });
}

export async function runKvHealthChecks(options?: { sealLimit?: number }): Promise<KvWatchdogReport> {
  const checked_at = new Date().toISOString();
  const findings: KvWatchdogFinding[] = [];

  const budget = await checkKvBudgetSuspension();
  findings.push(budget.finding);

  const canary = await checkKvWriteCanary();
  findings.push(canary.finding);

  const primary_kv_suspended = budget.suspended || canary.suspended;
  let seals_skipped = false;

  if (!primary_kv_suspended) {
    const seals = await listAllSeals(options?.sealLimit ?? 10_000);
    findings.push(...(await checkLatestSealKey(seals)));
    findings.push(checkBlockCollisions(seals));
    findings.push(checkReattestSpike(seals));
  } else {
    seals_skipped = true;
    findings.push(
      mk('latest_seal_key_present', 'informational', false, 'Skipped seal chain checks while KV suspended'),
    );
  }

  const report: KvWatchdogReport = {
    checked_at,
    findings,
    max_severity: maxSeverity(findings),
    primary_kv_suspended,
    seals_skipped,
  };

  try {
    await kvSet(WATCHDOG_STATE_KEY, report, 86400);
  } catch {
    // Best-effort state persistence when KV is degraded
  }

  return report;
}
