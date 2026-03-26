import { NextResponse } from 'next/server';
import { runSignalEngine } from '@/lib/signals/engine';
import { setHeartbeat } from '@/lib/runtime/heartbeat';
import { writeEpiconEntry } from '@/lib/epicon-writer';
import { getEchoEpicon } from '@/lib/echo/store';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { integrityStatusToGISnapshot } from '@/lib/terminal/api';
import { mockAgents, mockEpicon, mockTripwires } from '@/lib/terminal/mock';
import { detectTripwires, mergeTripwires } from '@/lib/echo/tripwire-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { tripwire } = await runSignalEngine();
  setHeartbeat();

  const epicon = getEchoEpicon();
  const items = epicon.length > 0 ? epicon : mockEpicon;
  const gi = integrityStatusToGISnapshot(integrityStatus);
  const autoTripwires = detectTripwires({
    epicon: items,
    gi,
    agents: mockAgents,
    tripwires: mockTripwires,
  });
  const merged = mergeTripwires(mockTripwires, autoTripwires);

  const giScore = integrityStatus.global_integrity;
  const term = integrityStatus.terminal_status;
  const high = merged.find((t) => t.severity === 'high');
  const medium = merged.find((t) => t.severity === 'medium');

  let severity: 'nominal' | 'degraded' | 'elevated' | 'critical' = 'nominal';
  if (term === 'critical' || high) {
    severity = 'critical';
  } else if (medium) {
    severity = 'elevated';
  } else if (term === 'stressed') {
    severity = 'degraded';
  }

  const anomalyLines: string[] = [];
  for (const t of merged) {
    if (t.severity === 'high') {
      anomalyLines.push(`⚠ CRITICAL: ${t.label} — ${t.action}`);
    } else if (t.severity === 'medium') {
      anomalyLines.push(`⚠ ELEVATED: ${t.label} — ${t.action}`);
    }
  }

  const anomalyCount = anomalyLines.length;
  const timestamp = new Date().toISOString();

  writeEpiconEntry({
    type: 'heartbeat',
    severity,
    title: `Heartbeat: ${severity.toUpperCase()} · GI ${giScore} · ${anomalyCount} anomalies`,
    author: 'cursor-agent',
    gi: giScore,
    anomalies: anomalyLines,
    tags: ['heartbeat', severity, 'automated'],
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: 'Heartbeat executed',
    timestamp,
    tripwire,
  });
}
