import { NextRequest, NextResponse } from 'next/server';
import { buildReplayCouncilPacket } from '@/lib/system/replay-council-packet';

export async function GET(req: NextRequest) {
  const sealId = req.nextUrl.searchParams.get('seal_id');
  const packet = await buildReplayCouncilPacket(sealId);
  if (!packet.ok) {
    return NextResponse.json(packet, { status: 400 });
  }
  return NextResponse.json(packet, { headers: { 'cache-control': 'no-store' } });
}
