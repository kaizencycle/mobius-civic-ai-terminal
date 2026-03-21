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
  const items = epicon.length > 0 ? epicon : mockEpicon;
  return scoreBatch(items).map((score) => score.signal);
}

function resolveActiveAgentCount() {
  return mockAgents.filter((agent) => agent.heartbeatOk && agent.status !== 'idle').length;
}

export async function GET() {
  const freshness = getStalenessStatus(getHeartbeat());
  const tripwire = getTripwireState();
  const computed = computeGI({
    zeusScores: resolveSignalQuality(),
    freshness: freshness.status,
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
    signals: {
      ...computed.signals,
      geopolitics: computed.signals.quality,
      economy: computed.signals.system,
      sentiment: computed.signals.stability,
      information: computed.signals.freshness,
    },
  });
}
