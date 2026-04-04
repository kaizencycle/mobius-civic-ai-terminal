/**
 * POST /api/eve/escalation-synthesize — EVE escalation-only governance synthesis (C-270).
 * Bearer: MOBIUS_SERVICE_SECRET | CRON_SECRET | BACKFILL_SECRET
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  buildEveGovernanceSynthesisOutput,
  escalationFingerprint,
  escalationIdempotencyTag,
  escalationWarranted,
  gatherEveGovernanceSynthesisInput,
  ledgerHasIdempotencyTag,
  publishEveGovernanceSynthesis,
  readLedgerRowsForEve,
} from '@/lib/eve/governance-synthesis';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { runSignalEngine } from '@/lib/signals/engine';

export const dynamic = 'force-dynamic';

type EscBody = {
  cycleId?: unknown;
  force?: unknown;
};

function parseBody(body: unknown): { cycleId: string | null; force: boolean } {
  if (body === null || typeof body !== 'object') {
    return { cycleId: null, force: false };
  }
  const o = body as EscBody;
  const raw = o.cycleId;
  const cycleId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const force = o.force === true;
  return { cycleId, force };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST with service Authorization when substrate escalation signals warrant an extra EVE synthesis',
    mode: 'escalation',
  });
}

export async function POST(request: NextRequest) {
  const authErr = getServiceAuthError(request);
  if (authErr) return authErr;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as unknown;
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cycleId: bodyCycle, force } = parseBody(body);
  const cycleId = bodyCycle ?? currentCycleId();

  await runSignalEngine();

  const allRows = await readLedgerRowsForEve(400);
  const input = await gatherEveGovernanceSynthesisInput(cycleId, { ledgerRows: allRows });

  if (!force && !escalationWarranted(input)) {
    return NextResponse.json({
      ok: true,
      cycleId,
      mode: 'escalation' as const,
      published: false,
      reason: 'no_escalation_signal',
      derivedFromCount: 0,
    });
  }

  const fingerprint = force ? `force-${Date.now()}` : escalationFingerprint(input);
  const idempotencyTag = escalationIdempotencyTag(cycleId, fingerprint);

  if (!force && ledgerHasIdempotencyTag(allRows, idempotencyTag)) {
    return NextResponse.json({
      ok: true,
      cycleId,
      mode: 'escalation' as const,
      published: false,
      reason: 'already_synthesized_for_escalation_class',
      idempotencyTag,
      derivedFromCount: 0,
    });
  }

  const output = buildEveGovernanceSynthesisOutput(input);
  const publishResult = await publishEveGovernanceSynthesis(input, output, idempotencyTag, allRows);

  return NextResponse.json({
    ok: true,
    cycleId,
    mode: 'escalation' as const,
    published: publishResult.published,
    entryId: publishResult.entryId,
    reason: publishResult.published ? 'escalation_signal' : 'already_synthesized_for_escalation_class',
    derivedFromCount: output.derivedFrom.length,
    idempotencyTag: publishResult.idempotencyTag,
    escalationFingerprint: fingerprint,
    governancePosture: output.governancePosture,
    externalDegraded: input.externalDegraded,
  });
}
