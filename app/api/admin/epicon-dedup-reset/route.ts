// ONE-TIME USE — C-295 bootstrap flush.
// Clears the cycle-scoped EPICON promotion dedup state so items blocked by
// the pre-fix global key can re-enter the promoter on the next cron tick.
// Delete this file once C-295 is confirmed healthy.

import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/kv/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { promotionFlushKeys } from '@/lib/epicon/promotion';

export const dynamic = 'force-dynamic';

function isAuthorized(token: string): boolean {
  const expected = process.env.AGENT_SERVICE_TOKEN?.trim() ?? '';
  return expected.length > 0 && token === expected;
}

export async function POST(req: NextRequest) {
  let requestedCycle: string | undefined;
  let bodyToken = '';

  try {
    const body = (await req.json()) as { token?: string; cycle?: string };
    requestedCycle = typeof body.cycle === 'string' ? body.cycle.trim() : undefined;
    bodyToken = typeof body.token === 'string' ? body.token.trim() : '';
  } catch {
    // body optional
  }

  const token = req.headers.get('x-service-token') ?? bodyToken;
  if (!isAuthorized(token)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const cycleId = requestedCycle ?? currentCycleId();
  const keys = promotionFlushKeys(cycleId);

  const results: Record<string, 'cleared' | 'already_empty'> = {};
  for (const key of keys) {
    const existing = await kvGet<unknown>(key);
    if (existing !== null && existing !== undefined) {
      // Overwrite with empty state and 1s TTL so it expires almost immediately
      await kvSet(key, {}, 1);
      results[key] = 'cleared';
    } else {
      results[key] = 'already_empty';
    }
  }

  return NextResponse.json({
    ok: true,
    cycle: cycleId,
    message: `Dedup state cleared for cycle ${cycleId}. Promotion lane will re-flow on next /api/epicon/promote call.`,
    results,
    timestamp: new Date().toISOString(),
  });
}
