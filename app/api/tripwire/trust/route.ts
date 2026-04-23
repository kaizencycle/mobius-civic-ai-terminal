import { NextResponse } from 'next/server';
import { kvGet } from '@/lib/kv/store';
import type { TrustTripwireSnapshot } from '@/lib/tripwire/types';

export const dynamic = 'force-dynamic';

const TRUST_TRIPWIRE_STATE_KEY = 'TRUST_TRIPWIRE_STATE';

function nominalTrustSnapshot(): TrustTripwireSnapshot {
  return {
    ok: true,
    tripwireCount: 0,
    elevated: false,
    critical: false,
    results: [],
    timestamp: new Date().toISOString(),
  };
}

function isTrustTripwireSnapshot(value: unknown): value is TrustTripwireSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.ok === 'boolean' &&
    typeof row.tripwireCount === 'number' &&
    typeof row.elevated === 'boolean' &&
    typeof row.critical === 'boolean' &&
    Array.isArray(row.results) &&
    typeof row.timestamp === 'string'
  );
}

export async function GET() {
  try {
    const state = await kvGet<unknown>(TRUST_TRIPWIRE_STATE_KEY);
    const snapshot = isTrustTripwireSnapshot(state)
      ? state
      : nominalTrustSnapshot();
    return NextResponse.json(
      {
        ok: true,
        trust_tripwire: snapshot,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('[tripwire/trust] read failed:', error);
    return NextResponse.json(
      {
        ok: true,
        trust_tripwire: nominalTrustSnapshot(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
