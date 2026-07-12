/**
 * Run EPICON promotion in-process (no HTTP round-trip).
 * EPICON: C-370 — avoids SUBSTRATE_TOKEN/CRON_SECRET mismatch on internal fetch.
 */

import { NextRequest } from 'next/server';
import { POST as postEpiconPromote } from '@/app/api/epicon/promote/route';
import { epiconPromoteAuthorizationHeader } from '@/lib/security/epiconPromoteAuth';
import { kvGet, kvSet } from '@/lib/kv/store';

const PROMOTE_FAIL_KEY = 'watchdog:promote-fail-count';

export type EpiconPromoteRunResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export async function runEpiconPromoteCron(origin: string, maxItems = 35): Promise<EpiconPromoteRunResult> {
  await kvSet('LAST_PROMOTION_RUN_AT', new Date().toISOString(), 7 * 24 * 3600).catch(() => {});

  const headers = new Headers({
    'Content-Type': 'application/json',
    'x-internal-cron': '1',
  });
  const auth = epiconPromoteAuthorizationHeader();
  if (auth) headers.set('authorization', auth);

  const request = new NextRequest(new URL('/api/epicon/promote', origin), {
    method: 'POST',
    headers,
    body: JSON.stringify({ maxItems }),
  });

  const response = await postEpiconPromote(request);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const failCount = ((await kvGet<number>(PROMOTE_FAIL_KEY)) ?? 0) + 1;
      await kvSet(PROMOTE_FAIL_KEY, failCount, 86400).catch(() => {});
    }
  } else {
    await kvSet(PROMOTE_FAIL_KEY, 0, 86400).catch(() => {});
  }

  return { ok: response.ok, status: response.status, body };
}
