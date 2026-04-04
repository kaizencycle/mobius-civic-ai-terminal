/**
 * POST /api/eve/cycle-synthesize — EVE governance / ethics synthesis → live EPICON ledger (C-270).
 * Bearer: MOBIUS_SERVICE_SECRET | CRON_SECRET | BACKFILL_SECRET
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  buildEveGovernanceSynthesisOutput,
  cycleSynthesisIdempotencyTag,
  cycleWindowBucket,
  gatherEveGovernanceSynthesisInput,
  ledgerHasIdempotencyTag,
  publishEveGovernanceSynthesis,
  readLedgerRowsForEve,
} from '@/lib/eve/governance-synthesis';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { runSignalEngine } from '@/lib/signals/engine';

export const dynamic = 'force-dynamic';

type CycleBody = {
  cycleId?: unknown;
  force?: unknown;
};

function parseCycleBody(body: unknown): { cycleId: string | null; force: boolean } {
  if (body === null || typeof body !== 'object') {
    return { cycleId: null, force: false };
  }
  const o = body as CycleBody;
  const raw = o.cycleId;
  const cycleId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const force = o.force === true;
  return { cycleId, force };
}

export async function GET(request: NextRequest) {
  const cycleId = currentCycleId();
  const windowBucket = cycleWindowBucket(Date.now());
  const idempotencyTag = cycleSynthesisIdempotencyTag(cycleId, windowBucket);

  return NextResponse.json({
    ok: true,
    info: 'POST with service Authorization to run EVE governance synthesis (live EPICON ledger)',
    mode: 'cycle',
    currentCycle: cycleId,
    windowBucket,
    idempotencyTagPreview: idempotencyTag,
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

  const { cycleId: bodyCycle, force } = parseCycleBody(body);
  const cycleId = bodyCycle ?? currentCycleId();

  await runSignalEngine();

  const allRows = await readLedgerRowsForEve(400);
  const nowMs = Date.now();
  const windowBucket = force ? `force-${nowMs}` : cycleWindowBucket(nowMs);
  const idempotencyTag = cycleSynthesisIdempotencyTag(cycleId, windowBucket);

  if (!force && ledgerHasIdempotencyTag(allRows, idempotencyTag)) {
    return NextResponse.json({
      ok: true,
      cycleId,
      mode: 'cycle' as const,
      published: false,
      reason: 'already_synthesized_for_window',
      idempotencyTag,
      derivedFromCount: 0,
    });
  }

  const input = await gatherEveGovernanceSynthesisInput(cycleId, { ledgerRows: allRows });
  const output = buildEveGovernanceSynthesisOutput(input);
  const publishResult = await publishEveGovernanceSynthesis(input, output, idempotencyTag, allRows);

  return NextResponse.json({
    ok: true,
    cycleId,
    mode: 'cycle' as const,
    published: publishResult.published,
    entryId: publishResult.entryId,
    reason: publishResult.published ? 'cycle_window_due' : 'already_synthesized_for_window',
    derivedFromCount: output.derivedFrom.length,
    idempotencyTag: publishResult.idempotencyTag,
    governancePosture: output.governancePosture,
    category: output.category,
    externalDegraded: input.externalDegraded,
  });
}
