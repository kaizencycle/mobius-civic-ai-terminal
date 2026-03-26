import { NextResponse } from 'next/server';
import { runSignalEngine } from '@/lib/signals/engine';
import { setHeartbeat } from '@/lib/runtime/heartbeat';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import type { RuntimeTripwireState } from '@/lib/tripwire/store';
import { writeEpiconEntry, type EpiconWritePayload } from '@/lib/epicon-writer';

export const dynamic = 'force-dynamic';

function heartbeatSeverity(
  terminalStatus: (typeof integrityStatus)['terminal_status'],
  tripwire: RuntimeTripwireState,
): EpiconWritePayload['severity'] {
  if (tripwire.active && tripwire.level === 'elevated') {
    return 'elevated';
  }
  if (tripwire.active && tripwire.level === 'watch') {
    return 'degraded';
  }
  if (terminalStatus === 'critical') {
    return 'critical';
  }
  if (terminalStatus === 'stressed') {
    return 'degraded';
  }
  return 'nominal';
}

function buildAnomalyLines(tripwire: RuntimeTripwireState): string[] {
  if (!tripwire.active) {
    return [];
  }
  return [`⚠ WARNING: ${tripwire.reason}`];
}

async function executeHeartbeat() {
  const { tripwire } = await runSignalEngine();
  setHeartbeat();

  const gi = integrityStatus.global_integrity;
  const severity = heartbeatSeverity(integrityStatus.terminal_status, tripwire);
  const anomalyLines = buildAnomalyLines(tripwire);
  const anomalyCount = anomalyLines.length;
  const timestamp = new Date().toISOString();

  // Write to EPICON KV ledger (non-blocking, best-effort)
  writeEpiconEntry({
    type: 'heartbeat',
    severity,
    title: `Heartbeat: ${severity.toUpperCase()} · GI ${gi} · ${anomalyCount} anomalies`,
    author: 'cursor-agent',
    gi,
    anomalies: anomalyLines,
    tags: ['heartbeat', severity, 'automated'],
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: 'Heartbeat executed',
    timestamp,
  });
}

export async function GET() {
  return executeHeartbeat();
}

export async function POST() {
  return executeHeartbeat();
}
