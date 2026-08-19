import { NextRequest, NextResponse } from 'next/server';
import { brokerGetPacket, brokerGetPacketWithPayload } from '@/lib/evidence/brokerClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<{ packetId: string }> };

const DEFAULT_PAYLOAD_READER = 'ECHO';
const DEFAULT_PAYLOAD_PURPOSE = 'terminal_facade_read';

export async function GET(request: NextRequest, context: RouteContext) {
  const { packetId } = await context.params;
  const includePayload = request.nextUrl.searchParams.get('includePayload') === 'true';
  const requesterAgent =
    request.nextUrl.searchParams.get('requesterAgent')?.trim() || DEFAULT_PAYLOAD_READER;
  const purpose = request.nextUrl.searchParams.get('purpose')?.trim() || DEFAULT_PAYLOAD_PURPOSE;

  const result = includePayload
    ? await brokerGetPacketWithPayload(packetId, { requesterAgent, purpose })
    : await brokerGetPacket(packetId);
  if (!result.ok && result.error === 'packet_not_found') {
    return NextResponse.json(result, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const status = result.degraded ? 503 : result.ok ? 200 : 502;
  return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}
