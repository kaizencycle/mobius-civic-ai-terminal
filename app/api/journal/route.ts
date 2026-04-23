import { NextRequest, NextResponse } from 'next/server';
import { GET as getJournal } from '@/app/api/chambers/journal/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const response = await getJournal(request);
    const payload = (await response.json()) as Record<string, unknown>;
    return NextResponse.json(
      {
        ...payload,
        ok: payload.ok === false ? false : true,
        degraded: payload.fallback === true,
        error: null,
      },
      { status: 200 },
    );
  } catch (error) {
    const mode = request.nextUrl.searchParams.get('mode') ?? 'merged';
    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        fallback: true,
        error: error instanceof Error ? error.message : 'journal_route_failed',
        mode,
        entries: [],
        canonical_available: false,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
