import { NextResponse } from 'next/server';
import { brokerListPackets } from '@/lib/evidence/brokerClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const result = await brokerListPackets(100);
  const status = result.degraded ? 503 : result.ok ? 200 : 502;
  return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}
