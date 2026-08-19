import { NextResponse } from 'next/server';
import { brokerGetPacket } from '@/lib/evidence/brokerClient';
import { requireEvidenceOperator } from '@/lib/evidence/operatorContext';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<{ packetId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const operator = await requireEvidenceOperator('terminal_evidence_metadata');
  if (operator instanceof NextResponse) {
    return operator;
  }

  const { packetId } = await context.params;
  const result = await brokerGetPacket(packetId);
  if (result.error === 'packet_not_found') {
    return NextResponse.json(result, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (result.degraded) {
    return NextResponse.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!result.ok) {
    return NextResponse.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
