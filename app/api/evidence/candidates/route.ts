import { NextRequest, NextResponse } from 'next/server';
import { brokerSubmitCandidates } from '@/lib/evidence/brokerClient';
import { requireEvidenceOperator } from '@/lib/evidence/operatorContext';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const operator = await requireEvidenceOperator('terminal_evidence_candidates');
  if (operator instanceof NextResponse) {
    return operator;
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const result = await brokerSubmitCandidates(body);
  if (result.degraded) {
    return NextResponse.json(result, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!result.ok) {
    return NextResponse.json(result, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
