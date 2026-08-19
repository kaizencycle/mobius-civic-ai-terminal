import { NextRequest, NextResponse } from 'next/server';
import { brokerResolve } from '@/lib/evidence/brokerClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const result = await brokerResolve(body);
  const status = result.degraded ? 503 : result.ok ? 200 : 502;
  return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}
