import { NextRequest, NextResponse } from 'next/server';
import { brokerGetPacket } from '@/lib/evidence/brokerClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<{ packetId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { packetId } = await context.params;
  const includePayload = request.nextUrl.searchParams.get('includePayload') === 'true';
  const result = await brokerGetPacket(packetId, includePayload);
  if (!result.ok && result.error === 'packet_not_found') {
    return NextResponse.json(result, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const status = result.degraded ? 503 : result.ok ? 200 : 502;
  return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}
