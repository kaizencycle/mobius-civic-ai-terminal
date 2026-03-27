import { NextResponse } from 'next/server';
import { getTripwireState } from '@/lib/tripwire/store';
import { mockTripwire } from '@/lib/mock-data';
import { liveEnvelope, mockEnvelope } from '@/lib/response-envelope';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      ...liveEnvelope(),
      tripwire: getTripwireState(),
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
