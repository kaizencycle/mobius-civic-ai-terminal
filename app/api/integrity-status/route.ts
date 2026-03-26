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
import { saveGIState, loadGIState, isRedisAvailable, type GIState } from '@/lib/kv/store';

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

export async function GET() {
  const freshness = getStalenessStatus(getHeartbeat());
  const tripwire = getTripwireState();
  const signalData = resolveSignalQuality();

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

  let source: 'live' | 'mock' | 'cached' = signalData.source;

  // If running on mock data AND Redis has a cached GI state, use the cached version
  // This is the cold-start recovery: Redis remembers the last real GI computation
  if (signalData.source === 'mock' && isRedisAvailable()) {
    const cached = await loadGIState();
    if (cached && cached.source !== 'mock') {
      // Redis has a recent live computation — use it instead of mock
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < 15 * 60 * 1000) {
        // Less than 15 min old — serve the cached live state
        return NextResponse.json({
          ok: true,
          cycle: currentCycleId(),
          timestamp: cached.timestamp,
          global_integrity: cached.global_integrity,
          mode: cached.mode,
          mii_baseline: integrityStatus.mii_baseline,
          mic_supply: integrityStatus.mic_supply,
          terminal_status: cached.terminal_status,
          primary_driver: cached.primary_driver,
          summary: 'GI reflects signal quality, freshness, tripwire stability, and active system health.',
          source: 'cached' as const,
          kv: true,
          signals: {
            ...cached.signals,
            geopolitics: cached.signals.quality,
            economy: cached.signals.system,
            sentiment: cached.signals.stability,
            information: cached.signals.freshness,
          },
        });
      }
    }
  }

  // Save current computation to Redis for future cold-start recovery
  if (isRedisAvailable()) {
    const giState: GIState = {
      global_integrity: computed.global_integrity,
      mode: computed.mode,
      terminal_status: computed.terminal_status,
      primary_driver: computed.primary_driver,
      source,
      signals: computed.signals,
      timestamp: computed.timestamp,
    };
    // Fire and forget — don't block the response
    saveGIState(giState).catch(() => {});
  }

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
    source,
    kv: isRedisAvailable(),
    signals: {
      ...computed.signals,
      geopolitics: computed.signals.quality,
      economy: computed.signals.system,
      sentiment: computed.signals.stability,
      information: computed.signals.freshness,
    },
  });
}
