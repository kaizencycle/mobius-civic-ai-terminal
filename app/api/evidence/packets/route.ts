import { NextResponse } from 'next/server';
import { brokerListPackets } from '@/lib/evidence/brokerClient';
import { requireEvidenceOperator } from '@/lib/evidence/operatorContext';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const operator = await requireEvidenceOperator('terminal_evidence_list');
  if (operator instanceof NextResponse) {
    return operator;
  }

  const result = await brokerListPackets(100);
  if (result.degraded) {
    return NextResponse.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!result.ok) {
    return NextResponse.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
