import { NextResponse } from 'next/server';
import { getTripwireState } from '@/lib/tripwire/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tripwire = getTripwireState();
  return NextResponse.json({ ok: true, tripwire, timestamp: new Date().toISOString() });
}
