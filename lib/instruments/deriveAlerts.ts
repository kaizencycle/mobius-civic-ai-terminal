import type { InstrumentsAlert, InstrumentsAlertSeverity } from '@/lib/instruments/types';

type LiteLane = {
  ok?: boolean;
  freshness?: string;
  elevated?: boolean;
};

type DeriveAlertsInput = {
  liteDegraded?: boolean;
  lanes?: Record<string, LiteLane> | null;
  failedInstruments?: { id: string; agent: string; error: string }[];
  kvContinuityOk?: boolean | null;
  integrityDegraded?: boolean;
};

function pushAlert(
  out: InstrumentsAlert[],
  severity: InstrumentsAlertSeverity,
  message: string,
  context?: string,
): void {
  out.push({ severity, message, ...(context ? { context } : {}) });
}

/**
 * Derive HUD alerts from real lane / instrument / KV signals only — no invented warnings.
 */
export function deriveInstrumentsAlerts(input: DeriveAlertsInput): InstrumentsAlert[] {
  const alerts: InstrumentsAlert[] = [];

  if (input.kvContinuityOk === false) {
    pushAlert(alerts, 'warning', 'KV continuity keys missing', 'C-406 seed-minimum');
  }

  if (input.integrityDegraded) {
    pushAlert(alerts, 'warning', 'Integrity status degraded', 'integrity-status');
  }

  if (input.liteDegraded) {
    pushAlert(alerts, 'info', 'Snapshot-lite degraded', 'terminal/snapshot-lite');
  }

  for (const laneName of ['kv', 'integrity', 'signals', 'echo'] as const) {
    const lane = input.lanes?.[laneName];
    if (!lane) continue;
    if (lane.ok === false) {
      pushAlert(alerts, 'warning', `Lane ${laneName} unavailable`, 'snapshot-lite');
    } else if (lane.freshness === 'degraded' || lane.freshness === 'stale') {
      pushAlert(alerts, 'info', `Lane ${laneName} ${lane.freshness}`, 'snapshot-lite');
    }
  }

  if (input.lanes) {
    const tripwire = input.lanes.tripwire as { elevated?: boolean } | undefined;
    if (tripwire?.elevated) {
      pushAlert(alerts, 'warning', 'Tripwire elevated', 'snapshot-lite');
    }
  }

  for (const failed of input.failedInstruments ?? []) {
    pushAlert(
      alerts,
      'warning',
      `Instrument ${failed.id} (${failed.agent})`,
      failed.error.slice(0, 120),
    );
  }

  return alerts.slice(0, 12);
}
