/**
 * Seal integrity gate — blocks pass attestations and new candidate formation
 * when KV watchdog reports critical block_number_collisions.
 *
 * EPICON: EPICON_C-372_GOVERNANCE_seal-attestation-flag_v1
 * Rollback: SEAL_INTEGRITY_GATE=off
 */

import { kvGet } from '@/lib/kv/store';
import { WATCHDOG_CRITICAL_ALERT_KEY, type KvWatchdogFinding } from '@/lib/watchdog/kvHealthChecks';

export type SealIntegrityGateState = {
  active: boolean;
  enabled: boolean;
  reasons: string[];
  alert_at: string | null;
  operator_cycle: string | null;
};

export function isSealIntegrityGateEnabled(): boolean {
  const raw = (process.env.SEAL_INTEGRITY_GATE ?? 'on').trim().toLowerCase();
  return raw !== 'off' && raw !== 'false' && raw !== '0';
}

function isCriticalCollisionFinding(finding: KvWatchdogFinding): boolean {
  return finding.check === 'block_number_collisions' && finding.severity === 'critical' && !finding.ok;
}

export async function getSealIntegrityGateState(): Promise<SealIntegrityGateState> {
  const enabled = isSealIntegrityGateEnabled();
  if (!enabled) {
    return { active: false, enabled: false, reasons: [], alert_at: null, operator_cycle: null };
  }

  const alert = await kvGet<{
    at?: string;
    cycle?: string;
    findings?: KvWatchdogFinding[];
  }>(WATCHDOG_CRITICAL_ALERT_KEY);

  if (!alert?.findings?.length) {
    return { active: false, enabled: true, reasons: [], alert_at: null, operator_cycle: null };
  }

  const collisionFindings = alert.findings.filter(isCriticalCollisionFinding);
  if (collisionFindings.length === 0) {
    return {
      active: false,
      enabled: true,
      reasons: [],
      alert_at: alert.at ?? null,
      operator_cycle: alert.cycle ?? null,
    };
  }

  return {
    active: true,
    enabled: true,
    reasons: collisionFindings.map((f) => f.message),
    alert_at: alert.at ?? null,
    operator_cycle: alert.cycle ?? null,
  };
}

export function sealIntegrityGateRationale(state: SealIntegrityGateState): string {
  const detail = state.reasons[0] ?? 'KV watchdog critical block_number_collisions';
  return (
    `Seal integrity gate active: ${detail}. ` +
    'Withhold pass attestation until collision root cause is cleared (EPICON_C-372 seal-attestation-flag).'
  );
}
