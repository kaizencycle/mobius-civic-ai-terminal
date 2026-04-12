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
import { appendAgentJournalEntry } from '@/lib/agents/journal';
import { loadGIState } from '@/lib/kv/store';
import { writeMiiState } from '@/lib/kv/mii';

export const dynamic = 'force-dynamic';

type CycleBody = {
  cycleId?: unknown;
  force?: unknown;
  mode?: unknown;
  reason?: unknown;
};

function inferEveConfidence(payload: unknown): number {
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    const c = row.confidence;
    if (typeof c === 'number' && Number.isFinite(c)) return Math.max(0, Math.min(1, c));
    const score = row.qualityScore;
    if (typeof score === 'number' && Number.isFinite(score)) return Math.max(0, Math.min(1, score));
    const promoted = row.promotedCount;
    if (typeof promoted === 'number' && promoted > 0) return 0.82;
  }
  return 0.74;
}

function inferEveSeverity(payload: unknown): 'nominal' | 'elevated' | 'critical' {
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    if (row.mode === 'escalation') return 'critical';
    const contested = row.contestedCount;
    if (typeof contested === 'number' && contested > 0) return 'elevated';
  }
  return 'nominal';
}

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
    info: 'GET is preview-only and does not run synthesis (unless Vercel Cron headers are present). Use POST with service Authorization to execute EVE governance synthesis.',
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

  try {
    await runSignalEngine();

    const payload =
      mode === 'escalation'
        ? await processEveEscalationSynthesis(cycleId, force, reason)
        : await processEveCycleWindowSynthesis(cycleId, force);

    const eveMii = inferEveConfidence(payload);

    void appendAgentJournalEntry({
      agent: 'EVE',
      cycle: cycleId,
      observation: `EVE ${mode} synthesis executed${reason ? ` for reason ${reason}` : ''}.`,
      inference:
        mode === 'escalation'
          ? 'Civic risk required escalation-class synthesis output.'
          : 'Cycle-window synthesis completed and published to the live EPICON ledger.',
      recommendation:
        mode === 'escalation'
          ? 'Prioritize ZEUS verification and ATLAS oversight checks.'
          : 'Continue normal verification cadence across ZEUS and ATLAS.',
      confidence: eveMii,
      derivedFrom: ['signal-engine:run', `eve-synthesis:${cycleId}`],
      relatedAgents: ['ZEUS', 'ATLAS'],
      status: 'committed',
      category: mode === 'escalation' ? 'alert' : 'inference',
      severity: inferEveSeverity(payload),
    }).catch(() => {});

    void (async () => {
      try {
        const giState = await loadGIState();
        await writeMiiState({
          agent: 'EVE',
          mii: Number(eveMii.toFixed(4)),
          gi: Number((giState?.global_integrity ?? 0.74).toFixed(4)),
          cycle: cycleId,
          timestamp: new Date().toISOString(),
          source: 'live',
        });
      } catch (err) {
        console.error('[eve] mii write failed:', err instanceof Error ? err.message : err);
      }
    })();

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'EVE synthesis failed';
    return NextResponse.json(
      {
        ok: false,
        cycleId,
        mode,
        published: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
