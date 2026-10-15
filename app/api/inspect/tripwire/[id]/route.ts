import { NextResponse } from 'next/server';
import { readTripwireState } from '@/lib/tripwire/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  // C-465 B2: read-through so this never presents a cold instance's memory
  // baseline as if it were an evaluated "clear" (W5/W7).
  const tripwire = await readTripwireState();
  return NextResponse.json({ ok: true, tripwire, timestamp: new Date().toISOString() });
}
