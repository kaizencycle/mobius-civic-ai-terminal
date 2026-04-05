/**
 * EVE governance / ethics synthesis → live EPICON ledger (C-270).
 *
 * GET — public preview (windowBucket, idempotencyTagPreview) or Vercel Cron cycle run when platform headers present.
 * POST — Bearer MOBIUS_SERVICE_SECRET | CRON_SECRET | BACKFILL_SECRET (or Vercel Cron without Bearer).
 *
 * Body: `{}` for cycle window synthesis, or `{ "mode": "escalation", "reason": "gi_critical" }`
 * for escalation-class synthesis (same auth; distinct idempotency when reason is set).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  cycleSynthesisIdempotencyTag,
  cycleWindowBucket,
  processEveCycleWindowSynthesis,
  processEveEscalationSynthesis,
} from '@/lib/eve/governance-synthesis';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getEveSynthesisAuthError, isVercelCronInvocation } from '@/lib/security/serviceAuth';
import { runSignalEngine } from '@/lib/signals/engine';

export const dynamic = 'force-dynamic';

type CycleBody = {
  cycleId?: unknown;
  force?: unknown;
  mode?: unknown;
  reason?: unknown;
};

function parseCycleBody(body: unknown): {
  cycleId: string | null;
  force: boolean;
  mode: 'cycle' | 'escalation';
  reason: string | null;
} {
  if (body === null || typeof body !== 'object') {
    return { cycleId: null, force: false, mode: 'cycle', reason: null };
  }
  const o = body as CycleBody;
  const raw = o.cycleId;
  const cycleId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const force = o.force === true;
  const modeRaw = o.mode;
  const mode = modeRaw === 'escalation' ? 'escalation' : 'cycle';
  const reasonRaw = o.reason;
  const reason = typeof reasonRaw === 'string' && reasonRaw.trim() ? reasonRaw.trim() : null;
  return { cycleId, force, mode, reason };
}

export async function GET(request: NextRequest) {
  const cycleId = currentCycleId();
  const windowBucket = cycleWindowBucket(Date.now());
  const idempotencyTag = cycleSynthesisIdempotencyTag(cycleId, windowBucket);

  /** Platform-scheduled cron only — keeps unauthenticated GET as a safe preview for STEP 2 of external automations. */
  if (isVercelCronInvocation(request)) {
    await runSignalEngine();
    const payload = await processEveCycleWindowSynthesis(cycleId, false);
    return NextResponse.json(payload);
  }

  return NextResponse.json({
    ok: true,
    info: 'POST with service Authorization to run EVE governance synthesis (live EPICON ledger). Vercel Cron GET runs cycle synthesis when scheduled.',
    mode: 'cycle',
    currentCycle: cycleId,
    windowBucket,
    idempotencyTagPreview: idempotencyTag,
  });
}

export async function POST(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
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

  const { cycleId: bodyCycle, force, mode, reason } = parseCycleBody(body);
  const cycleId = bodyCycle ?? currentCycleId();

  await runSignalEngine();

  const payload =
    mode === 'escalation'
      ? await processEveEscalationSynthesis(cycleId, force, reason)
      : await processEveCycleWindowSynthesis(cycleId, force);

  return NextResponse.json(payload);
}
