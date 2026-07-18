/**
 * Seal integrity gate — blocks pass attestations and new candidate formation
 * when KV watchdog reports critical block_number_collisions.
 *
 * EPICON: EPICON_C-372_GOVERNANCE_seal-attestation-flag_v1
 * Rollback: SEAL_INTEGRITY_GATE=off
 *
 * Live watchdog report (`watchdog:kv:last-report`) is authoritative when present;
 * stale `watchdog:kv:critical-alert` is fallback only until the next watchdog run.
 */

import { kvDel, kvGet } from '@/lib/kv/store';
import {
  WATCHDOG_CRITICAL_ALERT_KEY,
  WATCHDOG_STATE_KEY,
  type KvWatchdogFinding,
  type KvWatchdogReport,
} from '@/lib/watchdog/kvHealthChecks';

export type SealIntegrityGateState = {
  active: boolean;
  enabled: boolean;
  reasons: string[];
  alert_at: string | null;
  operator_cycle: string | null;
  source: 'live-report' | 'stale-alert' | 'none';
  /** Findings from the same source the gate used (live report, else stale alert). */
  authoritative_findings: KvWatchdogFinding[] | null;
};

export function isSealIntegrityGateEnabled(): boolean {
  const raw = (process.env.SEAL_INTEGRITY_GATE ?? 'on').trim().toLowerCase();
  return raw !== 'off' && raw !== 'false' && raw !== '0';
}

export function isCriticalCollisionFinding(finding: KvWatchdogFinding): boolean {
  return finding.check === 'block_number_collisions' && finding.severity === 'critical' && !finding.ok;
}

export function findCriticalCollisionFindings(findings: KvWatchdogFinding[]): KvWatchdogFinding[] {
  return findings.filter(isCriticalCollisionFinding);
}

/** Same findings source the gate uses: live report when present, else stale critical alert. */
export function resolveAuthoritativeWatchdogFindings(
  liveReport: Pick<KvWatchdogReport, 'findings'> | null,
  staleAlert: { findings?: KvWatchdogFinding[] } | null,
): KvWatchdogFinding[] | null {
  if (liveReport) return liveReport.findings;
  if (staleAlert?.findings?.length) return staleAlert.findings;
  return null;
}

export function shouldSealIntegrityGateBeActive(
  liveReport: Pick<KvWatchdogReport, 'findings'> | null,
  staleAlert: { at?: string; cycle?: string; findings?: KvWatchdogFinding[] } | null,
): Pick<SealIntegrityGateState, 'active' | 'reasons' | 'alert_at' | 'operator_cycle' | 'source'> {
  if (liveReport) {
    const live = findCriticalCollisionFindings(liveReport.findings);
    if (live.length > 0) {
      return {
        active: true,
        reasons: live.map((f) => f.message),
        alert_at: null,
        operator_cycle: null,
        source: 'live-report',
      };
    }
    return { active: false, reasons: [], alert_at: null, operator_cycle: null, source: 'live-report' };
  }

  if (staleAlert?.findings?.length) {
    const stale = findCriticalCollisionFindings(staleAlert.findings);
    if (stale.length > 0) {
      return {
        active: true,
        reasons: stale.map((f) => f.message),
        alert_at: staleAlert.at ?? null,
        operator_cycle: staleAlert.cycle ?? null,
        source: 'stale-alert',
      };
    }
  }

  return { active: false, reasons: [], alert_at: null, operator_cycle: null, source: 'none' };
}

/** Clear stale critical-alert KV when the latest watchdog run shows collisions resolved. */
export async function clearSealIntegrityGateIfCollisionsResolved(
  report: Pick<KvWatchdogReport, 'findings'>,
): Promise<boolean> {
  if (findCriticalCollisionFindings(report.findings).length > 0) {
    return false;
  }
  return kvDel(WATCHDOG_CRITICAL_ALERT_KEY);
}

export async function getSealIntegrityGateState(): Promise<SealIntegrityGateState> {
  const enabled = isSealIntegrityGateEnabled();
  if (!enabled) {
    return {
      active: false,
      enabled: false,
      reasons: [],
      alert_at: null,
      operator_cycle: null,
      source: 'none',
      authoritative_findings: null,
    };
  }

  const [liveReport, staleAlert] = await Promise.all([
    kvGet<KvWatchdogReport>(WATCHDOG_STATE_KEY),
    kvGet<{ at?: string; cycle?: string; findings?: KvWatchdogFinding[] }>(WATCHDOG_CRITICAL_ALERT_KEY),
  ]);

  const resolved = shouldSealIntegrityGateBeActive(liveReport, staleAlert);
  const authoritative_findings = resolveAuthoritativeWatchdogFindings(liveReport, staleAlert);
  return { enabled: true, ...resolved, authoritative_findings };
}

export function sealIntegrityGatePassVerdict(gate: SealIntegrityGateState): 'pass' | 'flag' {
  return gate.active ? 'flag' : 'pass';
}

export function sealIntegrityGateRationale(state: SealIntegrityGateState): string {
  const detail = state.reasons[0] ?? 'KV watchdog critical block_number_collisions';
  return (
    `Seal integrity gate active: ${detail}. ` +
    'Withhold pass attestation until collision root cause is cleared (EPICON_C-372 seal-attestation-flag).'
  );
}
