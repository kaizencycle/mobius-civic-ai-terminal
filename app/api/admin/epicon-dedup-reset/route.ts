import { NextRequest, NextResponse } from 'next/server';
import { kvDel } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

function getAuthToken(request: NextRequest): string {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return '';
}

export async function POST(request: NextRequest) {
  const serviceToken = process.env.AGENT_SERVICE_TOKEN?.trim() ?? '';
  const token = getAuthToken(request);

  if (!serviceToken || token !== serviceToken) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { cycleId?: string };
  const cycleId = typeof body.cycleId === 'string' && body.cycleId.trim() ? body.cycleId.trim() : null;

  const keys = [
    cycleId ? `epicon:promotion:dedup:${cycleId}` : null,
    cycleId ? `epicon:promotion:stall:${cycleId}` : null,
  ].filter((key): key is string => Boolean(key));

  const results: Record<string, 'deleted' | 'error'> = {};
  for (const key of keys) {
    try {
      await kvDel(key);
      results[key] = 'deleted';
    } catch {
      results[key] = 'error';
    }
  }

  return NextResponse.json({
    ok: true,
    cycleId,
    results,
    timestamp: new Date().toISOString(),
  });
}
