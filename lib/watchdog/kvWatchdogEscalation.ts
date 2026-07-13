/**
 * Tiered escalation for EVE KV watchdog — EPICON entries, Tripwire, EVE journal.
 * Hard-stop sealing is NOT enabled (pending custodian sign-off per implementation intent).
 */

import { appendAgentJournalEntry } from '@/lib/agents/journal';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import { kvGet, kvSet, KV_KEYS, KV_TTL_SECONDS } from '@/lib/kv/store';
import type { TrustTripwireResult, TrustTripwireSnapshot } from '@/lib/tripwire/types';
import {
  SEVERITY_RANK,
  WATCHDOG_CRITICAL_ALERT_KEY,
  type KvWatchdogReport,
  type WatchdogSeverity,
} from '@/lib/watchdog/kvHealthChecks';

const ESCALATION_STATE_KEY = 'watchdog:kv:escalation-state';
const ESCALATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const EPICON_SEVERITY: Record<Exclude<WatchdogSeverity, 'ok'>, EpiconLedgerFeedEntry['severity']> = {
  informational: 'info',
  warning: 'elevated',
  critical: 'critical',
};

function shouldPushEpicon(
  max: WatchdogSeverity,
  prev: { severity?: WatchdogSeverity; epicon_at?: string } | null,
): boolean {
  if (max === 'ok') return false;
  if (max === 'informational') return true;
  if (!prev?.epicon_at) return true;
  if (SEVERITY_RANK[max] > SEVERITY_RANK[prev.severity ?? 'ok']) return true;
  return Date.now() - new Date(prev.epicon_at).getTime() > ESCALATION_COOLDOWN_MS;
}

function isKvWatchdogTripwireResult(r: TrustTripwireResult): boolean {
  return r.kind === 'watchdog_failed_checks' && r.evidence?.source === 'kv-watchdog';
}

function buildTripwireSnapshot(results: TrustTripwireResult[], timestamp: string): TrustTripwireSnapshot {
  const tripwireCount = results.filter((r) => r.triggered).length;
  const critical = results.some((r) => r.triggered && r.severity === 'critical');
  return {
    ok: tripwireCount === 0,
    elevated: tripwireCount > 0,
    critical,
    tripwireCount,
    results,
    timestamp,
  };
}

async function persistTripwireSnapshot(snapshot: TrustTripwireSnapshot): Promise<void> {
  await Promise.all([
    kvSet(KV_KEYS.TRIPWIRE_STATE, snapshot, KV_TTL_SECONDS.TRIPWIRE_STATE),
    kvSet(KV_KEYS.TRIPWIRE_STATE_KV, snapshot, KV_TTL_SECONDS.TRIPWIRE_STATE),
  ]).catch(() => {});
}

async function clearTripwireKvWatchdog(timestamp: string): Promise<boolean> {
  const existing = await kvGet<TrustTripwireSnapshot>(KV_KEYS.TRIPWIRE_STATE);
  const withoutKv = (existing?.results ?? []).filter((r) => !isKvWatchdogTripwireResult(r));
  if (withoutKv.length === (existing?.results ?? []).length) {
    return false;
  }
  await persistTripwireSnapshot(buildTripwireSnapshot(withoutKv, timestamp));
  return true;
}

async function mergeTripwireKvWatchdog(
  report: KvWatchdogReport,
  operatorCycle: string,
  max: 'warning' | 'critical',
): Promise<boolean> {
  const timestamp = report.checked_at;
  const failedChecks = report.findings.filter((f) => !f.ok);

  const kvResult: TrustTripwireResult = {
    kind: 'watchdog_failed_checks',
    ok: false,
    triggered: true,
    severity: max === 'critical' ? 'critical' : 'elevated',
    score: max === 'critical' ? 0.15 : 0.5,
    message:
      max === 'critical'
        ? 'KV WATCHDOG CRITICAL — chain continuity risk'
        : 'KV WATCHDOG WARNING — vault/KV integrity degraded',
    evidence: {
      source: 'kv-watchdog',
      operator_cycle: operatorCycle,
      primary_kv_suspended: report.primary_kv_suspended,
      failed_checks: failedChecks.map((f) => ({
        check: f.check,
        message: f.message,
        severity: f.severity,
      })),
    },
    affectedAgents: ['EVE', 'ATLAS', 'ZEUS'],
    timestamp,
  };

  const existing = await kvGet<TrustTripwireSnapshot>(KV_KEYS.TRIPWIRE_STATE);
  const withoutKv = (existing?.results ?? []).filter((r) => !isKvWatchdogTripwireResult(r));
  const results = [...withoutKv, kvResult];
  await persistTripwireSnapshot(buildTripwireSnapshot(results, timestamp));

  return true;
}

export interface KvWatchdogEscalationResult {
  epicon_pushed: boolean;
  tripwire_updated: boolean;
  journal_pushed: boolean;
  critical_alert_recorded: boolean;
}

export async function escalateKvWatchdogReport(
  report: KvWatchdogReport,
  operatorCycle: string,
): Promise<KvWatchdogEscalationResult> {
  const max = report.max_severity;
  const failedChecks = report.findings.filter((f) => !f.ok);
  const prev = await kvGet<{ severity?: WatchdogSeverity; epicon_at?: string }>(ESCALATION_STATE_KEY);

  let epicon_pushed = false;
  let tripwire_updated = false;
  let journal_pushed = false;
  let critical_alert_recorded = false;

  if (max === 'ok') {
    tripwire_updated = await clearTripwireKvWatchdog(report.checked_at);
    await kvSet(ESCALATION_STATE_KEY, { severity: 'ok', at: report.checked_at }, 86400).catch(() => {});
    return { epicon_pushed, tripwire_updated, journal_pushed, critical_alert_recorded };
  }

  if (shouldPushEpicon(max, prev)) {
    try {
      await pushLedgerEntry({
        id: `kv-watchdog-${operatorCycle}-${Date.now()}`,
        timestamp: report.checked_at,
        author: 'EVE',
        title: `KV Watchdog [${max}]: ${failedChecks.map((f) => f.check).join(', ')}`,
        body: failedChecks.map((f) => `${f.check}: ${f.message}`).join('\n'),
        type: 'epicon',
        severity: EPICON_SEVERITY[max as Exclude<WatchdogSeverity, 'ok'>],
        source: 'kv-watchdog',
        tags: ['kv-watchdog', 'infra', operatorCycle, max],
        verified: false,
        category: 'watchdog',
        status: 'committed',
        agentOrigin: 'EVE',
        cycle: operatorCycle,
      });
      epicon_pushed = true;
    } catch (err) {
      console.error(
        '[kv-watchdog] EPICON ledger push failed (continuing escalation):',
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (max === 'warning' || max === 'critical') {
    tripwire_updated = await mergeTripwireKvWatchdog(report, operatorCycle, max);
  }

  if (max === 'warning' || max === 'critical') {
    await appendAgentJournalEntry({
      agent: 'EVE',
      cycle: operatorCycle,
      observation: `KV watchdog ${max}: ${failedChecks.map((f) => f.check).join(', ')}.`,
      inference: report.primary_kv_suspended
        ? 'Primary KV may be suspended — chain continuity at risk (see C-370 Q2).'
        : 'Vault/KV integrity signals degraded; investigate before next seal formation.',
      recommendation:
        'Review watchdog findings and GOVERNANCE_DECISION Q2 fixes. Hard-stop sealing is NOT enabled — pending custodian sign-off.',
      confidence: max === 'critical' ? 0.85 : 0.72,
      derivedFrom: failedChecks.map((f) => `kv-watchdog:${f.check}`),
      relatedAgents: ['ATLAS', 'ZEUS'],
      status: 'committed',
      category: 'alert',
      severity: max === 'critical' ? 'critical' : 'elevated',
    }).catch((err) => {
      console.error('[kv-watchdog] EVE journal append failed:', err instanceof Error ? err.message : err);
    });
    journal_pushed = true;
  }

  if (max === 'critical') {
    await kvSet(
      WATCHDOG_CRITICAL_ALERT_KEY,
      {
        at: report.checked_at,
        cycle: operatorCycle,
        findings: failedChecks,
        github_issue_requested: true,
        hard_stop_enabled: false,
        note: 'Custodian GitHub issue recommended; hard-stop sealing gated off pending sign-off.',
      },
      604800,
    ).catch(() => {});
    critical_alert_recorded = true;
    console.error('[kv-watchdog] CRITICAL findings — custodian alert recorded', {
      cycle: operatorCycle,
      checks: failedChecks.map((f) => f.check),
    });
  }

  await kvSet(
    ESCALATION_STATE_KEY,
    {
      severity: max,
      at: report.checked_at,
      epicon_at: epicon_pushed ? report.checked_at : prev?.epicon_at,
    },
    86400,
  ).catch(() => {});

  return { epicon_pushed, tripwire_updated, journal_pushed, critical_alert_recorded };
}
