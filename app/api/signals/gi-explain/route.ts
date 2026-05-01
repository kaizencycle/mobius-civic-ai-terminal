import { NextRequest, NextResponse } from 'next/server';
import { loadGIState, loadSignalSnapshot } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SignalRow = {
  agentName: string;
  source: string;
  value: number;
  label: string;
  severity: string;
  timestamp?: string;
};

function severityWeight(severity: string): number {
  if (severity === 'critical') return 1;
  if (severity === 'elevated') return 0.75;
  if (severity === 'watch') return 0.45;
  return 0.15;
}

function agentFamily(agentName: string): string {
  return agentName.split('-')[0]?.toUpperCase() ?? 'UNKNOWN';
}

function summarizeByFamily(signals: SignalRow[]) {
  const families = new Map<string, { family: string; count: number; averageValue: number; anomalyPressure: number; critical: number; elevated: number; watch: number; nominal: number }>();

  for (const signal of signals) {
    const family = agentFamily(signal.agentName);
    const row = families.get(family) ?? {
      family,
      count: 0,
      averageValue: 0,
      anomalyPressure: 0,
      critical: 0,
      elevated: 0,
      watch: 0,
      nominal: 0,
    };
    row.count += 1;
    row.averageValue += Number.isFinite(signal.value) ? signal.value : 0.5;
    row.anomalyPressure += severityWeight(signal.severity);
    if (signal.severity === 'critical') row.critical += 1;
    else if (signal.severity === 'elevated') row.elevated += 1;
    else if (signal.severity === 'watch') row.watch += 1;
    else row.nominal += 1;
    families.set(family, row);
  }

  return Array.from(families.values())
    .map((row) => ({
      ...row,
      averageValue: Number((row.averageValue / Math.max(1, row.count)).toFixed(3)),
      anomalyPressure: Number((row.anomalyPressure / Math.max(1, row.count)).toFixed(3)),
    }))
    .sort((a, b) => a.averageValue - b.averageValue || b.anomalyPressure - a.anomalyPressure);
}

function topDrivers(signals: SignalRow[]) {
  return [...signals]
    .sort((a, b) => {
      const severityDelta = severityWeight(b.severity) - severityWeight(a.severity);
      if (Math.abs(severityDelta) > 0.001) return severityDelta;
      return a.value - b.value;
    })
    .slice(0, 12)
    .map((signal) => ({
      agentName: signal.agentName,
      family: agentFamily(signal.agentName),
      source: signal.source,
      value: Number(signal.value.toFixed(3)),
      severity: signal.severity,
      label: signal.label,
      timestamp: signal.timestamp ?? null,
    }));
}

export async function GET(_request: NextRequest) {
  const [snapshot, gi] = await Promise.all([loadSignalSnapshot(), loadGIState()]);
  const signals = (snapshot?.allSignals ?? []) as SignalRow[];
  const signalQuality =
    signals.length > 0
      ? Number((signals.reduce((sum, signal) => sum + (Number.isFinite(signal.value) ? signal.value : 0.5), 0) / signals.length).toFixed(3))
      : null;
  const anomalyCount = signals.filter((signal) => signal.severity === 'elevated' || signal.severity === 'critical').length;
  const criticalCount = signals.filter((signal) => signal.severity === 'critical').length;

  return NextResponse.json(
    {
      ok: true,
      version: 'C-297.phase3.signal-gi-explain.v1',
      canonical: true,
      source: 'kv-signal-snapshot-and-gi-state',
      signal_snapshot: snapshot
        ? {
            timestamp: snapshot.timestamp,
            checkedAt: snapshot.checkedAt ?? null,
            unchanged: snapshot.unchanged ?? false,
            healthy: snapshot.healthy,
            composite: snapshot.composite,
            anomalyCount,
            criticalCount,
            instrumentCount: signals.length,
            signalQuality,
            signalHash: snapshot.signal_hash ?? null,
          }
        : null,
      gi_state: gi
        ? {
            timestamp: gi.timestamp,
            global_integrity: gi.global_integrity,
            mode: gi.mode,
            terminal_status: gi.terminal_status,
            primary_driver: gi.primary_driver,
            gi_write_source: gi.gi_write_source ?? null,
            signals: gi.signals,
          }
        : null,
      alignment: {
        signalCompositeEqualsGi: Boolean(snapshot && gi && Number(snapshot.composite.toFixed(3)) === Number(gi.global_integrity.toFixed(3))),
        signalTimestamp: snapshot?.timestamp ?? null,
        giTimestamp: gi?.timestamp ?? null,
      },
      family_pressure: summarizeByFamily(signals),
      top_drivers: topDrivers(signals),
      canon: [
        'Signals are canonical sensory input for Global Integrity State.',
        'GI_STATE is updated by runMicroSweepPipeline via saveGiStateFromMicroSweep.',
        'This endpoint explains signal contribution; it does not mutate GI, ledger, Vault, MIC, or Canon.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'signal-gi-explain',
      },
    },
  );
}
