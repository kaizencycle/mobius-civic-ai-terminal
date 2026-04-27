// ONE-TIME USE — C-295 bootstrap flush.
// Clears the cycle-scoped EPICON promotion dedup state so items blocked by
// the pre-fix global key can re-enter the promoter on the next cron tick.
// Delete this file once C-295 is confirmed healthy.

import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/kv/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { promotionFlushKeys } from '@/lib/epicon/promotion';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const body_token = req.headers.get('x-service-token') ?? '';
  const expected = process.env.AGENT_SERVICE_TOKEN?.trim() ?? '';
  return expected.length > 0 && body_token === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let requestedCycle: string | undefined;
  try {
    const body = (await req.json()) as { cycle?: string };
    requestedCycle = typeof body.cycle === 'string' ? body.cycle.trim() : undefined;
  } catch {
    // body optional
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
