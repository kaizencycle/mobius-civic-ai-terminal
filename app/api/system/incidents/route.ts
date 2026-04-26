import { NextRequest, NextResponse } from 'next/server';
import { listIncidents } from '@/lib/system/incidents';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function clampLimit(input: string | null): number {
  const parsed = Number(input ?? '50');
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const incidents = await listIncidents(limit);
  return NextResponse.json({
    ok: true,
    count: incidents.length,
    incidents,
    canon: 'Incidents are preserved as the survival trail of the system.',
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'incident-registry',
    },
  });
}
