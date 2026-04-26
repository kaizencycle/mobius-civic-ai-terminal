import { NextRequest, NextResponse } from 'next/server';
import type { AgentSignedAction } from '@/lib/agents/signatures';
import { verifyAgentAction } from '@/lib/agents/signatures';
import { consumeDedupeKey } from '@/lib/agents/dedupe';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ConsumeBody = {
  signed?: AgentSignedAction;
  payload?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConsumeBody;
    if (!body.signed) return NextResponse.json({ ok: false, error: 'missing_signed_envelope' }, { status: 400 });

    const verification = verifyAgentAction({ signed: body.signed, payload: body.payload ?? null });
    if (!verification.ok) {
      return NextResponse.json({ ok: false, reason: verification.reason }, { status: 400 });
    }

    const consumed = await consumeDedupeKey({
      dedupe_key: body.signed.dedupe_key,
      agent: body.signed.agent,
      action: body.signed.action,
      payload_hash: body.signed.payload_hash,
    });

    if (!consumed.ok) {
      return NextResponse.json({
        ok: false,
        reason: 'dedupe_key_already_consumed',
        existing: consumed.existing,
      }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      reason: 'signature_verified_and_dedupe_consumed',
      record: consumed.record,
      envelope: verification.envelope ?? null,
      canon: 'A signed action may execute once per dedupe key.',
    }, { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'agent-signature-consume' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'signature_consume_failed' }, { status: 500 });
  }
}
