import { NextResponse } from 'next/server';
import { kvGet, KV_KEYS } from '@/lib/kv/store';
import type { TrustTripwireSnapshot } from '@/lib/tripwire/types';

export const dynamic = 'force-dynamic';

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

export async function GET() {
  const state = await kvGet<TrustTripwireSnapshot>(KV_KEYS.TRIPWIRE_STATE_KV);

  return NextResponse.json(
    {
      ok: true,
      trust_tripwire: state ?? nominalTrustSnapshot(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
