import { NextRequest, NextResponse } from 'next/server';
import { getTripwireState, setTripwireState, type RuntimeTripwireState } from '@/lib/tripwire/store';
import { mockTripwire } from '@/lib/mock-data';
import { liveEnvelope, mockEnvelope } from '@/lib/response-envelope';
import { saveTripwireState } from '@/lib/kv/store';

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

export async function GET() {
  try {
    const tripwire = getTripwireState();
    await saveTripwireState({
      active: tripwire.active,
      level: tripwire.active ? 'elevated' : 'none',
      reason: tripwire.reason,
      last_updated: tripwire.last_updated,
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
  await saveTripwireState({
    active: nextTripwire.active,
    level: nextTripwire.active ? 'elevated' : 'none',
    reason: nextTripwire.reason,
    last_updated: nextTripwire.last_updated,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    tripwire: nextTripwire,
  });
}
