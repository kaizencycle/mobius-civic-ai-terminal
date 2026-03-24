import { NextResponse } from 'next/server';
import { computeGI } from '@/lib/gi/compute';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getEchoEpicon } from '@/lib/echo/store';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { getHeartbeat } from '@/lib/runtime/heartbeat';
import { getStalenessStatus } from '@/lib/runtime/staleness';
import { scoreBatch } from '@/lib/echo/signal-engine';
import { mockAgents, mockEpicon } from '@/lib/terminal/mock';
import { getTripwireState } from '@/lib/tripwire/store';

export const dynamic = 'force-dynamic';

function resolveSignalQuality() {
  const epicon = getEchoEpicon();
  const isLive = epicon.length > 0;
  const items = isLive ? epicon : mockEpicon;
  const scores = scoreBatch(items).map((score) => score.signal);

  // If using mock data, apply a 20% penalty — mock perfection is not real integrity
  if (!isLive) {
    return { scores: scores.map((s) => s * 0.8), source: 'mock' as const };
  }
  return { scores, source: 'live' as const };
}

function resolveActiveAgentCount() {
  return mockAgents.filter((agent) => agent.heartbeatOk && agent.status !== 'idle').length;
}

export async function GET() {
  const freshness = getStalenessStatus(getHeartbeat());
  const tripwire = getTripwireState();
  const signalData = resolveSignalQuality();

  // If running on mock data with no real heartbeat, degrade freshness
  const effectiveFreshness =
    signalData.source === 'mock' && freshness.status === 'fresh'
      ? ('degraded' as const)
      : freshness.status;

  const computed = computeGI({
    zeusScores: signalData.scores,
    freshness: effectiveFreshness,
    tripwire: tripwire.level,
    activeAgents: resolveActiveAgentCount(),
  });

  return NextResponse.json({
    ok: true,
    cycle: currentCycleId(),
    timestamp: computed.timestamp,
    global_integrity: computed.global_integrity,
    mode: computed.mode,
    mii_baseline: integrityStatus.mii_baseline,
    mic_supply: integrityStatus.mic_supply,
    terminal_status: computed.terminal_status,
    primary_driver: computed.primary_driver,
    summary: computed.summary,
    source: signalData.source,
    signals: {
      ...computed.signals,
      geopolitics: computed.signals.quality,
      economy: computed.signals.system,
      sentiment: computed.signals.stability,
      information: computed.signals.freshness,
    },
  });
}
