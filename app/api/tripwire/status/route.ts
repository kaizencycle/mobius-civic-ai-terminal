import { NextRequest, NextResponse } from 'next/server';
import { getTripwireState, setTripwireState, type RuntimeTripwireState } from '@/lib/tripwire/store';
import { mockTripwire } from '@/lib/mock-data';
import { liveEnvelope, mockEnvelope } from '@/lib/response-envelope';
import { saveTripwireState } from '@/lib/kv/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';

type TripwireUpdatePayload = {
  triggered: boolean;
  reason: string;
  agent: 'HERMES' | 'ZEUS' | 'ATLAS' | 'operator';
  severity: 'low' | 'medium' | 'high';
};

function authorized(request: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret || !secret.trim()) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function parsePayload(value: unknown): TripwireUpdatePayload | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.triggered !== 'boolean') return null;
  if (typeof obj.reason !== 'string' || !obj.reason.trim()) return null;
  if (
    obj.agent !== 'HERMES' &&
    obj.agent !== 'ZEUS' &&
    obj.agent !== 'ATLAS' &&
    obj.agent !== 'operator'
  ) {
    return null;
  }
  if (obj.severity !== 'low' && obj.severity !== 'medium' && obj.severity !== 'high') return null;

  return {
    triggered: obj.triggered,
    reason: obj.reason.trim(),
    agent: obj.agent,
    severity: obj.severity,
  };
}

function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function writeTripwireKvState(activeTripwires: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(
      'TRIPWIRE_STATE',
      JSON.stringify({
        cycleId: currentCycleId(),
        tripwireCount: activeTripwires,
        elevated: activeTripwires > 0,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error('[tripwire] TRIPWIRE_STATE write failed', error);
  }
}

export async function GET() {
  try {
    const tripwire = getTripwireState();
    await writeTripwireKvState(tripwire.active ? 1 : 0);
    await saveTripwireState({
      cycleId: currentCycleId(),
      tripwireCount: tripwire.active ? 1 : 0,
      elevated: tripwire.active,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      ...liveEnvelope(),
      tripwire,
      last_updated: new Date().toISOString(),
      freshness: { status: 'fresh', seconds: 0 },
    });
  } catch (error) {
    console.error('tripwire/status evaluation failed', error);
    return NextResponse.json({
      ok: true,
      ...mockEnvelope('Tripwire evaluation failed'),
      tripwire: mockTripwire(),
      last_updated: new Date().toISOString(),
      freshness: { status: 'unknown', seconds: null },
    });
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const payload = parsePayload(await request.json().catch((): unknown => null));
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload. Expected { triggered, reason, agent, severity }' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const nextTripwire: RuntimeTripwireState = payload.triggered
    ? {
        active: true,
        level: payload.severity,
        reason: payload.reason,
        last_updated: now,
        triggeredBy: payload.agent,
      }
    : {
        active: false,
        level: 'nominal',
        reason: `Cleared by ${payload.agent}`,
        last_updated: now,
        triggeredBy: payload.agent,
      };

  setTripwireState(nextTripwire);
  await writeTripwireKvState(nextTripwire.active ? 1 : 0);
  await saveTripwireState({
    cycleId: currentCycleId(),
    tripwireCount: nextTripwire.active ? 1 : 0,
    elevated: nextTripwire.active,
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    tripwire: nextTripwire,
  });
}
