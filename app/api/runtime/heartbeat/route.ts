import { NextResponse } from 'next/server';
import { runSignalEngine } from '@/lib/signals/engine';
import { setHeartbeat } from '@/lib/runtime/heartbeat';

export const dynamic = 'force-dynamic';

export async function GET() {
  await runSignalEngine();
  setHeartbeat();

  return NextResponse.json({
    ok: true,
    message: 'Heartbeat executed',
    timestamp: new Date().toISOString(),
  });
}
