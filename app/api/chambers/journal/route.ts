import { NextRequest, NextResponse } from 'next/server';
import { GET as getJournal } from '@/app/api/agents/journal/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? 'merged';
  const limit = request.nextUrl.searchParams.get('limit') ?? '100';
  const agent = request.nextUrl.searchParams.get('agent');
  const cycle = request.nextUrl.searchParams.get('cycle');
  const q = new URLSearchParams({ mode, limit });
  if (agent) q.set('agent', agent);
  if (cycle) q.set('cycle', cycle);

  const forwarded = new NextRequest(`${request.nextUrl.origin}/api/agents/journal?${q.toString()}`, {
    headers: request.headers,
  });

  try {
    const res = await getJournal(forwarded);
    const json = (await res.json()) as { entries?: unknown[]; mode?: 'hot' | 'canon' | 'merged' };
    return NextResponse.json({
      ok: true,
      mode: json.mode ?? (mode as 'hot' | 'canon' | 'merged'),
      entries: json.entries ?? [],
      canonical_available: true,
      fallback: false,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      ok: true,
      mode: mode as 'hot' | 'canon' | 'merged',
      entries: [],
      canonical_available: false,
      fallback: true,
      timestamp: new Date().toISOString(),
    });
  }
}
