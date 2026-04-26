import { NextRequest, NextResponse } from 'next/server';
import type { AgentSignedAction } from '@/lib/agents/signatures';
import { verifyAgentAction } from '@/lib/agents/signatures';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type VerifyBody = {
  signed?: AgentSignedAction;
  payload?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyBody;
    if (!body.signed) {
      return NextResponse.json({ ok: false, error: 'missing_signed_envelope' }, { status: 400 });
    }
    const result = verifyAgentAction({ signed: body.signed, payload: body.payload ?? null });
    return NextResponse.json({
      ok: result.ok,
      reason: result.reason,
      envelope: result.envelope ?? null,
      canon: 'A signed agent action is valid only when registry, scope, payload hash, signature, and dedupe intent align.',
    }, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'agent-signature-verify' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'signature_verify_failed' }, { status: 500 });
  }
}
