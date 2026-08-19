import { NextResponse } from 'next/server';
import { getOperatorSession, type OperatorSession } from '@/lib/auth/session';

export type EvidenceOperatorContext = {
  session: OperatorSession;
  requesterAgent: string;
  purpose: string;
};

export function operatorRequesterAgent(session: OperatorSession): string {
  return `OPERATOR:${session.username}`;
}

/** Fail-closed: evidence broker facades require an authenticated operator session. */
export async function requireEvidenceOperator(
  purpose = 'terminal_evidence_chamber',
): Promise<EvidenceOperatorContext | NextResponse> {
  const session = await getOperatorSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'operator_auth_required', reason: 'Sign in to access Evidence Commons.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return {
    session,
    requesterAgent: operatorRequesterAgent(session),
    purpose,
  };
}
