import { NextResponse } from 'next/server';
import { runSignalEngine } from '@/lib/signals/engine';
import { setHeartbeat } from '@/lib/runtime/heartbeat';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { integrityStatusToGISnapshot } from '@/lib/terminal/api';
import { writeEpiconEntry } from '@/lib/epicon-writer';

export const dynamic = 'force-dynamic';

function heartbeatSeverity(
  terminalStatus: typeof integrityStatus.terminal_status,
  tripwireLevel: 'none' | 'watch' | 'elevated',
  tripwireActive: boolean,
): 'nominal' | 'degraded' | 'elevated' | 'critical' {
  if (terminalStatus === 'critical') return 'critical';
  if (terminalStatus === 'stressed') return 'degraded';
  if (tripwireActive && tripwireLevel === 'elevated') return 'elevated';
  if (tripwireActive && tripwireLevel === 'watch') return 'degraded';
  return 'nominal';
}

async function executeHeartbeat() {
  const result = await runSignalEngine();
  setHeartbeat();

  const giSnapshot = integrityStatusToGISnapshot(integrityStatus);
  const gi = giSnapshot.score;
  const severity = heartbeatSeverity(
    integrityStatus.terminal_status,
    result.tripwire.level,
    result.tripwire.active,
  );
  const anomalyLines = result.tripwire.active ? [result.tripwire.reason] : [];
  const anomalyCount = anomalyLines.length;

  const timestamp = new Date().toISOString();

  writeEpiconEntry({
    type: 'heartbeat',
    severity,
    title: `Heartbeat: ${severity.toUpperCase()} · GI ${gi ?? '–'} · ${anomalyCount} anomalies`,
    author: 'cursor-agent',
    gi,
    anomalies: anomalyLines,
    tags: ['heartbeat', severity, 'automated'],
  }).catch(() => {});

  return {
    ok: true as const,
    message: 'Heartbeat executed',
    timestamp,
    gi,
    severity,
    tripwire: result.tripwire,
    signalsCount: result.signals.length,
  };
}

export async function GET() {
  return NextResponse.json(await executeHeartbeat());
}

export async function POST() {
  return NextResponse.json(await executeHeartbeat());
}
