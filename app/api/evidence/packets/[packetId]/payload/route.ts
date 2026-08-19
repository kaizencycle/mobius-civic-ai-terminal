import { NextResponse } from 'next/server';
import { brokerGetPacketWithPayload } from '@/lib/evidence/brokerClient';
import { requireEvidenceOperator } from '@/lib/evidence/operatorContext';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<{ packetId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const operator = await requireEvidenceOperator('terminal_evidence_payload');
  if (operator instanceof NextResponse) {
    return operator;
  }

  const { packetId } = await context.params;
  const result = await brokerGetPacketWithPayload(packetId, {
    requesterAgent: operator.requesterAgent,
    purpose: operator.purpose,
  });

  if (result.error === 'packet_not_found') {
    return NextResponse.json(result, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (result.degraded) {
    return NextResponse.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!result.ok) {
    return NextResponse.json(result, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
