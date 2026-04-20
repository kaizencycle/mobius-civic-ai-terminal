// ============================================================================
// GET /api/signals/micro
// Runs all micro-instruments (sensor federation sweep) and returns aggregated signal data.
// C-261 · KV persistence for cold-start recovery
// CC0 Public Domain
// ============================================================================

import { NextResponse } from 'next/server';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import {
  saveSignalSnapshot,
  loadSignalSnapshot,
  isRedisAvailable,
  kvSet,
  KV_KEYS,
  KV_TTL_SECONDS,
  saveGiStateFromMicroSweep,
} from '@/lib/kv/store';
import { updateSustainTrackingFromGi } from '@/lib/mic/sustainTracker';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';

export const dynamic = 'force-dynamic';

let cached: { data: Awaited<ReturnType<typeof pollAllMicroAgents>>; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000;
let lastLedgerPushMs = 0;
const LEDGER_PUSH_INTERVAL_MS = 10 * 60 * 1000;

export async function GET() {
  const now = Date.now();

  // Return in-memory cache if fresh
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      ok: true,
      cached: true,
      ...cached.data,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Mobius-Source': 'micro-agents-cached',
      },
    });
  }

  try {
    const result = await pollAllMicroAgents();
    cached = { data: result, timestamp: now };

    const signalQuality =
      result.allSignals.length > 0
        ? result.allSignals.reduce((s, x) => s + x.value, 0) / result.allSignals.length
        : result.composite;
    saveGiStateFromMicroSweep({ composite: result.composite, signalQuality }).catch(() => {});
    updateSustainTrackingFromGi(result.composite).catch(() => {});

    // Persist signal snapshot to Redis for cold-start recovery
    if (isRedisAvailable()) {
      saveSignalSnapshot({
        composite: result.composite,
        anomalies: result.anomalies?.length ?? 0,
        allSignals: (result.allSignals ?? []).map((s: { agentName: string; source: string; value: number; label: string; severity: string; timestamp?: string }) => ({
          agentName: s.agentName,
          source: s.source,
          value: s.value,
          label: s.label,
          severity: s.severity,
          timestamp: s.timestamp,
        })),
        timestamp: result.timestamp,
        healthy: result.healthy,
      }).catch(() => {});

      kvSet(
        KV_KEYS.HEARTBEAT,
        JSON.stringify({
          ok: true,
          gi: result.composite,
          cycle: currentCycleId(),
          anomalies: result.anomalies?.length ?? 0,
          familyCount: 8,
          instrumentCount: result.instrumentCount ?? 40,
          timestamp: result.timestamp,
          source: 'micro-sweep',
        }),
        KV_TTL_SECONDS.HEARTBEAT,
      ).catch(() => {});

      kvSet(
        KV_KEYS.SYSTEM_PULSE,
        {
          ok: true,
          composite: result.composite,
          cycle: currentCycleId(),
          instruments: result.instrumentCount ?? 40,
          anomalies: result.anomalies?.length ?? 0,
          timestamp: result.timestamp,
        },
        KV_TTL_SECONDS.SYSTEM_PULSE,
      ).catch(() => {});

      if (now - lastLedgerPushMs > LEDGER_PUSH_INTERVAL_MS) {
        lastLedgerPushMs = now;
        pushLedgerEntry({
          id: `micro-sweep-${currentCycleId()}-${Date.now()}`,
          timestamp: result.timestamp,
          author: 'DAEDALUS',
          title: `Sensor sweep: ${result.instrumentCount ?? 40} instruments, composite ${result.composite.toFixed(3)}, ${result.anomalies?.length ?? 0} anomalies`,
          type: 'epicon',
          severity: (result.anomalies?.length ?? 0) > 5 ? 'elevated' : 'nominal',
          source: 'kv-ledger',
          tags: ['micro-sweep', 'heartbeat', currentCycleId()],
          verified: false,
          category: 'heartbeat',
          status: 'committed',
          agentOrigin: 'DAEDALUS',
        }).catch(() => {});
      }
    }

    const degradedInstruments = result.allSignals
      .filter((s) => s.severity === 'elevated' || s.severity === 'critical')
      .map((s) => ({ agentName: s.agentName, source: s.source, severity: s.severity, label: s.label }));

    return NextResponse.json({
      ok: true,
      cached: false,
      kv: isRedisAvailable(),
      degraded_instruments: degradedInstruments,
      ...result,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Mobius-Source': 'micro-agents-live',
      },
    });
  } catch (err) {
    // On failure, try to serve last-known state from Redis
    if (isRedisAvailable()) {
      const snapshot = await loadSignalSnapshot();
      if (snapshot) {
        const degradedInstruments = snapshot.allSignals
          .filter((s) => s.severity === 'elevated' || s.severity === 'critical')
          .map((s) => ({ agentName: s.agentName, source: s.source, severity: s.severity, label: s.label }));
        return NextResponse.json({
          ok: true,
          cached: true,
          source: 'kv-fallback',
          composite: snapshot.composite,
          anomalies: snapshot.allSignals.filter((s) => s.severity === 'elevated' || s.severity === 'critical'),
          allSignals: snapshot.allSignals,
          timestamp: snapshot.timestamp,
          healthy: snapshot.healthy,
          degraded_instruments: degradedInstruments,
        }, {
          headers: {
            'X-Mobius-Source': 'micro-agents-kv-fallback',
          },
        });
      }
    }

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
