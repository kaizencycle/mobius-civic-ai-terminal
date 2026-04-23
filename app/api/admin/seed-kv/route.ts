// ============================================================================
// POST /api/admin/seed-kv
// One-time KV seed route — writes live system state to all Upstash KV keys.
//
// Use when KV is empty (e.g. after first deploy or after key expiry) to
// bootstrap the EPICON feed away from GitHub-fallback mode.
//
// Auth: Bearer CRON_SECRET or MOBIUS_SERVICE_SECRET
// C-630 · fix(kv): seed route + unconditional heartbeat KV writes
// CC0 Public Domain
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { kvSet, KV_KEYS, saveGIState, saveSignalSnapshot, isRedisAvailable, KV_TTL_SECONDS } from '@/lib/kv/store';
import { computeGI } from '@/lib/gi/compute';
import { getEchoEpicon } from '@/lib/echo/store';
import { scoreBatch } from '@/lib/echo/signal-engine';
import { mockEpicon, mockAgents } from '@/lib/terminal/mock';
import { getTripwireState } from '@/lib/tripwire/store';
import { getHeartbeat } from '@/lib/runtime/heartbeat';
import { getStalenessStatus } from '@/lib/runtime/staleness';
import { pollAllMicroAgents } from '@/lib/agents/micro';

export const dynamic = 'force-dynamic';

function normalizeTripwireLevel(
  level: ReturnType<typeof getTripwireState>['level'],
): 'none' | 'watch' | 'elevated' {
  if (level === 'high' || level === 'triggered' || level === 'suspended' || level === 'elevated')
    return 'elevated';
  if (level === 'medium' || level === 'watch') return 'watch';
  return 'none';
}

export async function POST(request: NextRequest) {
  const authError = getServiceAuthError(request);
  if (authError) return authError;

  if (!isRedisAvailable()) {
    return NextResponse.json({ ok: false, error: 'Redis not available' }, { status: 503 });
  }

  const timestamp = new Date().toISOString();
  const seeded: string[] = [];

  // ── Compute GI (same logic as /api/integrity-status) ─────────
  const freshness = getStalenessStatus(getHeartbeat());
  const tripwire = getTripwireState();
  const epicon = getEchoEpicon();
  const isLive = epicon.length > 0;
  const items = isLive ? epicon : mockEpicon;
  const zeusScores = scoreBatch(items).map((s) => s.signal);
  const effectiveFreshness =
    !isLive && freshness.status === 'fresh' ? ('degraded' as const) : freshness.status;
  const activeAgents = mockAgents.filter(
    (a: { heartbeatOk: boolean; status: string }) => a.heartbeatOk && a.status !== 'idle',
  ).length;

  const computed = computeGI({
    zeusScores,
    freshness: effectiveFreshness,
    tripwire: normalizeTripwireLevel(tripwire.level),
    activeAgents,
  });

  // Write GI_STATE
  await saveGIState({
    global_integrity: computed.global_integrity,
    mode: computed.mode,
    terminal_status: computed.terminal_status,
    primary_driver: computed.primary_driver,
    source: isLive ? 'live' : 'mock',
    signals: computed.signals,
    timestamp,
  });
  seeded.push('GI_STATE');

  // Write HEARTBEAT
  await kvSet(
    KV_KEYS.HEARTBEAT,
    JSON.stringify({
      ok: true,
      gi: computed.global_integrity,
      timestamp,
      source: 'manual-seed',
    }),
    KV_TTL_SECONDS.HEARTBEAT,
  );
  seeded.push('HEARTBEAT');

  // Write LAST_INGEST
  await kvSet(KV_KEYS.LAST_INGEST, timestamp);
  seeded.push('LAST_INGEST');

  // ── Signal snapshot (best-effort — external APIs may be down) ─
  try {
    const signals = await pollAllMicroAgents();
    await saveSignalSnapshot({
      composite: signals.composite,
      anomalies: signals.anomalies.length,
      allSignals: signals.allSignals.map((s) => ({
        agentName: s.agentName,
        source: s.source,
        value: s.value,
        label: s.label,
        severity: s.severity,
      })),
      timestamp: signals.timestamp,
      healthy: signals.healthy,
    });
    seeded.push('SIGNAL_SNAPSHOT');
  } catch {
    // Non-fatal — GI_STATE, HEARTBEAT, and LAST_INGEST are already written
  }

  return NextResponse.json({ ok: true, seeded, timestamp });
}
