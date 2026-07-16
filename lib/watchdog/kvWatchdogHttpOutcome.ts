/**
 * Classify kv-watchdog HTTP responses so consumers can distinguish:
 * - genuine integrity blocks (hash-divergent block_number collisions)
 * - infrastructure / incomplete checks (KV suspended, canary failure, skipped seal chain)
 * - escalation dependency degradation (identity service, EPICON push) without conflating with 409
 *
 * EPICON: EPICON_C-370_EVE_kv-watchdog-implementation_v1, C-373 production triage
 */

import {
  findCriticalCollisionFindings,
  type SealIntegrityGateState,
} from '@/lib/watchdog/sealIntegrityGate';
import type { KvWatchdogReport } from '@/lib/watchdog/kvHealthChecks';
import type { KvWatchdogDependencyFailure } from '@/lib/watchdog/kvWatchdogEscalation';

export type KvWatchdogOutcome =
  | 'ok'
  | 'informational'
  | 'warning'
  | 'integrity_blocked'
  | 'critical_infra'
  | 'check_incomplete';

export type KvWatchdogHttpResolution = {
  outcome: KvWatchdogOutcome;
  http_status: number;
  /** True when deposit formation / pass attestation are blocked via seal integrity gate. */
  hard_stop_enabled: boolean;
  seal_integrity_gate_active: boolean;
  /** Primary human-readable reason for the HTTP status (distinct from escalation noise). */
  primary_reason: string | null;
  collision_count: number | null;
  checks_complete: boolean;
  degraded_dependencies: KvWatchdogDependencyFailure[];
};

function collisionHashDivergentCount(report: KvWatchdogReport): number {
  const findings = findCriticalCollisionFindings(report.findings);
  if (findings.length === 0) return 0;
  const evidence = findings[0]?.evidence;
  if (evidence && typeof evidence.hash_divergent_collisions === 'number') {
    return evidence.hash_divergent_collisions;
  }
  return findings.length;
}

export function resolveKvWatchdogHttpOutcome(args: {
  report: KvWatchdogReport;
  sealGate: Pick<SealIntegrityGateState, 'active'>;
  degradedDependencies?: KvWatchdogDependencyFailure[];
}): KvWatchdogHttpResolution {
  const degraded_dependencies = args.degradedDependencies ?? [];
  const checks_complete = !args.report.seals_skipped;
  const collisionFindings = findCriticalCollisionFindings(args.report.findings);
  const collision_count =
    collisionFindings.length > 0 ? collisionHashDivergentCount(args.report) : null;
  const hard_stop_enabled = args.sealGate.active;
  const seal_integrity_gate_active = args.sealGate.active;

  if (!checks_complete) {
    const suspended = args.report.primary_kv_suspended;
    return {
      outcome: 'check_incomplete',
      http_status: 503,
      hard_stop_enabled,
      seal_integrity_gate_active,
      primary_reason: suspended
        ? 'Seal chain checks skipped — primary KV suspended; collision state unknown this run'
        : 'Seal chain checks skipped; collision state unknown this run',
      collision_count: null,
      checks_complete: false,
      degraded_dependencies,
    };
  }

  if (collisionFindings.length > 0) {
    const message = collisionFindings[0]?.message ?? 'hash-divergent block_number collision(s)';
    return {
      outcome: 'integrity_blocked',
      http_status: 409,
      hard_stop_enabled,
      seal_integrity_gate_active,
      primary_reason: message,
      collision_count,
      checks_complete: true,
      degraded_dependencies,
    };
  }

  if (args.report.max_severity === 'critical') {
    const failed = args.report.findings.filter((f) => !f.ok);
    return {
      outcome: 'critical_infra',
      http_status: 503,
      hard_stop_enabled,
      seal_integrity_gate_active,
      primary_reason: failed.map((f) => f.message).join('; ') || 'KV watchdog critical infrastructure finding',
      collision_count: null,
      checks_complete: true,
      degraded_dependencies,
    };
  }

  if (args.report.max_severity === 'warning') {
    const failed = args.report.findings.filter((f) => !f.ok);
    return {
      outcome: 'warning',
      http_status: degraded_dependencies.length > 0 ? 207 : 207,
      hard_stop_enabled,
      seal_integrity_gate_active,
      primary_reason: failed[0]?.message ?? 'KV watchdog warning',
      collision_count: null,
      checks_complete: true,
      degraded_dependencies,
    };
  }

  if (args.report.max_severity === 'informational') {
    return {
      outcome: 'informational',
      http_status: degraded_dependencies.length > 0 ? 207 : 200,
      hard_stop_enabled,
      seal_integrity_gate_active,
      primary_reason: null,
      collision_count: null,
      checks_complete: true,
      degraded_dependencies,
    };
  }

  return {
    outcome: 'ok',
    http_status: degraded_dependencies.length > 0 ? 207 : 200,
    hard_stop_enabled,
    seal_integrity_gate_active,
    primary_reason: null,
    collision_count: null,
    checks_complete: true,
    degraded_dependencies,
  };
}
