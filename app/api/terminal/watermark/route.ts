import { NextResponse } from 'next/server';
import { getJournalRedisClient } from '@/lib/agents/journalLane';
import { readTerminalWatermark } from '@/lib/terminal/watermark';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const redis = getJournalRedisClient();
  const watermark = await readTerminalWatermark(redis);
  return NextResponse.json(
    {
      ok: true,
      ...watermark,
      source: redis ? 'kv' : 'memory-fallback',
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
