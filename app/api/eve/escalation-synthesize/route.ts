/**
 * POST /api/eve/escalation-synthesize — EVE escalation-only governance synthesis (C-270).
 * Bearer: MOBIUS_SERVICE_SECRET | CRON_SECRET | BACKFILL_SECRET
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { processEveEscalationSynthesis } from '@/lib/eve/governance-synthesis';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { runSignalEngine } from '@/lib/signals/engine';

export const dynamic = 'force-dynamic';

type EscBody = {
  cycleId?: unknown;
  force?: unknown;
  reason?: unknown;
};

function parseBody(body: unknown): { cycleId: string | null; force: boolean; reason: string | null } {
  if (body === null || typeof body !== 'object') {
    return { cycleId: null, force: false, reason: null };
  }
  const o = body as EscBody;
  const raw = o.cycleId;
  const cycleId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const force = o.force === true;
  const reasonRaw = o.reason;
  const reason = typeof reasonRaw === 'string' && reasonRaw.trim() ? reasonRaw.trim() : null;
  return { cycleId, force, reason };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST with service Authorization when substrate escalation signals warrant an extra EVE synthesis',
    mode: 'escalation',
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

  const { cycleId: bodyCycle, force, reason } = parseBody(body);
  const cycleId = bodyCycle ?? currentCycleId();

  await runSignalEngine();

  const payload = await processEveEscalationSynthesis(cycleId, force, reason);

  return NextResponse.json(payload);
}
