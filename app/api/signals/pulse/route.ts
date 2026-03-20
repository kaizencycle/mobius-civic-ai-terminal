import { NextResponse } from 'next/server';
import { runSignalEngine } from '@/lib/signals/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await runSignalEngine();

  return NextResponse.json({
    ok: true,
    count: result.signals.length,
    signals: result.signals,
    tripwire: result.tripwire,
  });
}
