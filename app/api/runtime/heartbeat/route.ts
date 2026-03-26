import { NextResponse } from 'next/server';
import { runSignalEngine } from '@/lib/signals/engine';
import { setHeartbeat, getHeartbeat } from '@/lib/runtime/heartbeat';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import { computeGI } from '@/lib/gi/compute';
import { getEchoEpicon } from '@/lib/echo/store';
import { scoreBatch } from '@/lib/echo/signal-engine';
import { mockAgents, mockEpicon } from '@/lib/terminal/mock';
import { getTripwireState } from '@/lib/tripwire/store';
import { getStalenessStatus } from '@/lib/runtime/staleness';
import { writeEpiconEntry } from '@/lib/epicon-writer';

export const dynamic = 'force-dynamic';

function resolveSignalQuality() {
  const epicon = getEchoEpicon();
  const isLive = epicon.length > 0;
  const items = isLive ? epicon : mockEpicon;
  const scores = scoreBatch(items).map((score) => score.signal);

  if (!isLive) {
    return { scores: scores.map((s) => s * 0.8), source: 'mock' as const };
  }
  return { scores, source: 'live' as const };
}

function resolveActiveAgentCount() {
  return mockAgents.filter((agent) => agent.heartbeatOk && agent.status !== 'idle').length;
}

function formatAnomalyLines(
  anomalies: Array<{ label: string; severity: string }>,
): string[] {
  return anomalies.map((a) => {
    const level =
      a.severity === 'critical' ? 'CRITICAL' : a.severity === 'elevated' ? 'ELEVATED' : 'WARNING';
    return `⚠ ${level}: ${a.label}`;
  });
}

/** Aligns with sentinel-heartbeat.yml health labels; maps "offline" to critical for EpiconWritePayload. */
function heartbeatSeverity(
  health: 'nominal' | 'degraded' | 'offline',
): 'nominal' | 'degraded' | 'elevated' | 'critical' {
  if (health === 'nominal') return 'nominal';
  if (health === 'degraded') return 'degraded';
  return 'critical';
}

export async function GET() {
  await runSignalEngine();
  setHeartbeat();

  const timestamp = new Date().toISOString();

  let microOk = false;
  let integrityOk = false;
  let gi: number | undefined;
  let anomalyLines: string[] = [];
  let anomalyCount = 0;

  try {
    const micro = await pollAllMicroAgents();
    microOk = micro.healthy && micro.agents.length > 0;
    anomalyCount = micro.anomalies.length;
    anomalyLines = formatAnomalyLines(micro.anomalies);
  } catch {
    microOk = false;
  }

  try {
    const freshness = getStalenessStatus(getHeartbeat());
    const tripwire = getTripwireState();
    const signalData = resolveSignalQuality();
    const effectiveFreshness =
      signalData.source === 'mock' && freshness.status === 'fresh' ? ('degraded' as const) : freshness.status;

    const computed = computeGI({
      zeusScores: signalData.scores,
      freshness: effectiveFreshness,
      tripwire: tripwire.level,
      activeAgents: resolveActiveAgentCount(),
    });
    gi = computed.global_integrity;
    integrityOk = true;
  } catch {
    integrityOk = false;
  }

  const runtimeOk = true;
  let health: 'nominal' | 'degraded' | 'offline';
  if (microOk && integrityOk && runtimeOk) {
    health = 'nominal';
  } else if (microOk || integrityOk) {
    health = 'degraded';
  } else {
    health = 'offline';
  }

  const severity = heartbeatSeverity(health);

  // Write to EPICON KV ledger (non-blocking, best-effort)
  writeEpiconEntry({
    type: 'heartbeat',
    severity,
    title: `Heartbeat: ${severity.toUpperCase()} · GI ${gi ?? '–'} · ${anomalyCount} anomalies`,
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
