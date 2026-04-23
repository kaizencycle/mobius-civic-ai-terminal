import { NextRequest, NextResponse } from 'next/server';
import { runSignalEngine } from '@/lib/signals/engine';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import { setHeartbeat } from '@/lib/runtime/heartbeat';
import { writeEpiconEntry } from '@/lib/epicon-writer';
import { getEchoEpicon } from '@/lib/echo/store';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { integrityStatusToGISnapshot } from '@/lib/terminal/api';
import { mockAgents, mockEpicon, mockTripwires } from '@/lib/terminal/mock';
import { detectTripwires, mergeTripwires } from '@/lib/echo/tripwire-engine';
import {
  getServiceAuthError,
  isValidCronSecretBearer,
  isVercelCronInvocation,
} from '@/lib/security/serviceAuth';
import { kvSet, KV_KEYS, isRedisAvailable, KV_TTL_SECONDS } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

/**
 * Write HEARTBEAT and LAST_INGEST to KV unconditionally — this fires before
 * the auth check so that even 401'd browser polls keep KV fresh.
 * Auth gates the HTTP response, not this side-effect write.
 */
async function writeHeartbeatKV() {
  if (!isRedisAvailable()) return;
  const timestamp = new Date().toISOString();
  const giScore = integrityStatus.global_integrity;
  await Promise.allSettled([
    kvSet(
      KV_KEYS.HEARTBEAT,
      JSON.stringify({ ok: true, gi: giScore, timestamp, source: 'heartbeat' }),
      KV_TTL_SECONDS.HEARTBEAT,
    ),
    kvSet(KV_KEYS.LAST_INGEST, timestamp),
  ]);
}

async function runHeartbeat() {
  // Run signal engine and micro-agent sweep in parallel — independent data sources.
  const [{ tripwire }, microResult] = await Promise.all([
    runSignalEngine(),
    pollAllMicroAgents().catch(() => null),
  ]);
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

  // Signal-level anomalies from micro-agents: { agentName, source, severity, label }
  const signalAnomalies = (microResult?.anomalies ?? []).map((s) => ({
    agentName: s.agentName,
    source: s.source,
    severity: s.severity,
    label: s.label,
  }));

  const anomalyCount = signalAnomalies.length > 0 ? signalAnomalies.length : anomalyLines.length;
  const titleSuffix =
    signalAnomalies.length > 0
      ? `anomalies: ${signalAnomalies.map((s) => s.source).join(', ')}`
      : `${anomalyCount} anomalies`;

  const timestamp = new Date().toISOString();

  writeEpiconEntry({
    type: 'heartbeat',
    severity,
    title: `Heartbeat: ${severity.toUpperCase()} · GI ${giScore} · ${titleSuffix}`,
    author: 'cursor-agent',
    gi: giScore,
    anomalies: anomalyLines,
    signalAnomalies,
    tags: ['heartbeat', severity, 'automated'],
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: 'Heartbeat executed',
    timestamp,
    tripwire,
  });
}

function authorize(request: NextRequest) {
  if (isVercelCronInvocation(request)) {
    return null;
  }
  if (isValidCronSecretBearer(request.headers.get('authorization'))) {
    return null;
  }
  return getServiceAuthError(request);
}

export async function GET(request: NextRequest) {
  writeHeartbeatKV().catch(() => {}); // fire-and-forget, before auth
  const authError = authorize(request);
  if (authError) return authError;
  return runHeartbeat();
}

/** Same behavior as GET — for cron/agents that POST the heartbeat. */
export async function POST(request: NextRequest) {
  writeHeartbeatKV().catch(() => {}); // fire-and-forget, before auth
  const authError = authorize(request);
  if (authError) return authError;
  return runHeartbeat();
}
