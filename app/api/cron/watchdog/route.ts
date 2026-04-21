import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError, serviceAuthorizationHeaderValue } from '@/lib/security/serviceAuth';
import { appendAgentJournalEntry } from '@/lib/agents/journal';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { kvSet, kvSetRawKey, KV_KEYS, isRedisAvailable, KV_TTL_SECONDS } from '@/lib/kv/store';

import { GET as getKvHealth } from '@/app/api/kv/health/route';
import { POST as postSeedKv } from '@/app/api/admin/seed-kv/route';
import { GET as getIntegrityStatus } from '@/app/api/integrity-status/route';
import { GET as getTripwireStatus } from '@/app/api/tripwire/status/route';
import { POST as postEchoIngest } from '@/app/api/echo/ingest/route';
import { POST as postEpiconPromote } from '@/app/api/epicon/promote/route';

/**
 * C-274: Runtime maintenance is currently once-daily (Vercel cron). If heartbeat,
 * journal/archive merge, or promotion normalization need tighter cadence, extend
 * this handler (or add schedules) in one place — avoid per-lane commit spam.
 *
 * C-283 (ATLAS synthesis): previously this handler called each downstream route
 * via `fetch(new URL(path, request.nextUrl.origin))`, which round-trips through
 * the Vercel edge. On production deployments with Deployment Protection
 * enabled, the edge returned 401 *before* our route handlers ran — producing
 * the ATLAS synthesis log:
 *
 *   kv-health:fail:401, seed-kv:fail:401, integrity-status:fail:401,
 *   tripwire-state:fail:401, echo-ingest:fail:401, promote:fail:401
 *
 * Several of those routes (kv/health, integrity-status, echo/ingest, promote)
 * have no internal auth guard at all — the 401s could only have come from the
 * edge. Adding `Authorization: Bearer $secret` to the outbound fetch does not
 * help, because Deployment Protection checks its own cookie / bypass header,
 * not service secrets.
 *
 * Fix: invoke the route handlers directly in-process (same pattern as
 * /api/terminal/snapshot). This keeps the call chain entirely inside Node.js,
 * bypasses the edge, and preserves internal auth semantics because we pass
 * the original incoming NextRequest (which already carries the cron secret
 * verified by `getServiceAuthError` at the top of this handler).
 */
export const dynamic = 'force-dynamic';

type WatchdogActionResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

function makeInternalRequest(
  origin: string,
  path: string,
  init?: { method?: string; body?: unknown },
): NextRequest {
  const headers = new Headers();
  const outboundAuth = serviceAuthorizationHeaderValue();
  if (outboundAuth) {
    headers.set('authorization', outboundAuth);
  } else {
    const candidates = [process.env.CRON_SECRET, process.env.RENDER_SCHEDULER_SECRET];
    for (const raw of candidates) {
      if (typeof raw === 'string' && raw.trim().length > 0) {
        headers.set('authorization', `Bearer ${raw.trim()}`);
        break;
      }
    }
  }
  if (init?.body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  const url = new URL(path, origin);
  return new NextRequest(url, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function runHandler<T extends (request: NextRequest) => Promise<NextResponse>>(
  handler: T,
  request: NextRequest,
  timeoutMs = 15_000,
  retries = 1,
): Promise<WatchdogActionResult> {
  const once = async (): Promise<WatchdogActionResult> => {
    try {
      const response = await Promise.race<NextResponse>([
        handler(request),
        new Promise<NextResponse>((_, reject) =>
          setTimeout(() => reject(new Error('handler_timeout')), timeoutMs),
        ),
      ]);
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      return {
        ok: false,
        status: 500,
        body: { error: error instanceof Error ? error.message : 'Unknown handler error' },
      };
    }
  };

  let r = await once();
  if (!r.ok && retries > 0) {
    await new Promise((res) => setTimeout(res, 1000));
    r = await once();
  }
  return r;
}

// Some handlers declare `GET()` with no parameters (kv/health, integrity-status,
// tripwire/status, echo/ingest-GET). Adapt them to the (request) signature so
// the dispatcher above can treat them uniformly.
async function runParameterlessHandler(
  handler: () => Promise<NextResponse>,
  timeoutMs = 15_000,
  retries = 1,
): Promise<WatchdogActionResult> {
  const once = async (): Promise<WatchdogActionResult> => {
    try {
      const response = await Promise.race<NextResponse>([
        handler(),
        new Promise<NextResponse>((_, reject) =>
          setTimeout(() => reject(new Error('handler_timeout')), timeoutMs),
        ),
      ]);
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      return {
        ok: false,
        status: 500,
        body: { error: error instanceof Error ? error.message : 'Unknown handler error' },
      };
    }
  };

  let r = await once();
  if (!r.ok && retries > 0) {
    await new Promise((res) => setTimeout(res, 1000));
    r = await once();
  }
  return r;
}

export async function GET(request: NextRequest) {
  const authError = getServiceAuthError(request);
  if (authError) return authError;

  const actions: string[] = [];
  const timestamp = new Date().toISOString();
  const origin = request.nextUrl.origin;

  const kvHealth = await runParameterlessHandler(getKvHealth);
  actions.push(`kv-health:${kvHealth.ok ? 'ok' : `fail:${kvHealth.status}`}`);

  if (isRedisAvailable() && kvHealth.ok) {
    const keys = (kvHealth.body as { keys?: Record<string, boolean> } | null)?.keys;
    if (keys && !keys.TRIPWIRE_STATE && !keys.TRIPWIRE_STATE_KV) {
      const seedPayload = {
        cycleId: currentCycleId(),
        tripwireCount: 0,
        elevated: false,
        timestamp: new Date().toISOString(),
      };
      await Promise.all([
        kvSetRawKey('TRIPWIRE_STATE', JSON.stringify(seedPayload), KV_TTL_SECONDS.TRIPWIRE_STATE),
        kvSet(KV_KEYS.TRIPWIRE_STATE, seedPayload, KV_TTL_SECONDS.TRIPWIRE_STATE),
        kvSet(KV_KEYS.TRIPWIRE_STATE_KV, seedPayload, KV_TTL_SECONDS.TRIPWIRE_STATE),
      ]).catch(() => {});
      actions.push('tripwire-seed:ok');
    }
  }

  const seedRequest = makeInternalRequest(origin, '/api/admin/seed-kv', { method: 'POST' });
  const seedResult = await runHandler(postSeedKv, seedRequest);
  actions.push(`seed-kv:${seedResult.ok ? 'ok' : `fail:${seedResult.status}`}`);

  const giResult = await runParameterlessHandler(getIntegrityStatus);
  actions.push(`integrity-status:${giResult.ok ? 'ok' : `fail:${giResult.status}`}`);

  const tripwireResult = await runParameterlessHandler(getTripwireStatus);
  actions.push(`tripwire-state:${tripwireResult.ok ? 'ok' : `fail:${tripwireResult.status}`}`);

  const echoResult = await runParameterlessHandler(postEchoIngest, 30_000);
  actions.push(`echo-ingest:${echoResult.ok ? 'ok' : `fail:${echoResult.status}`}`);

  const promoteRequest = makeInternalRequest(origin, '/api/epicon/promote', {
    method: 'POST',
    body: { maxItems: 35 },
  });
  const promoteResult = await runHandler(postEpiconPromote, promoteRequest, 30_000);
  actions.push(`promote:${promoteResult.ok ? 'ok' : `fail:${promoteResult.status}`}`);

  const logResult = {
    seeded: seedResult.body,
    gi: giResult.body,
    kvHealth: kvHealth.body,
    timestamp,
    source: 'watchdog',
  };
  console.info('[watchdog] daily run', logResult);

  const failed = actions.filter((action) => action.includes('fail')).length;

  void pushLedgerEntry({
    id: `watchdog-${currentCycleId()}-${Date.now()}`,
    timestamp,
    author: 'ATLAS',
    title: `Watchdog: ${actions.length} checks, ${failed} failed`,
    type: 'epicon',
    severity: failed === 0 ? 'nominal' : 'elevated',
    source: 'kv-ledger',
    tags: ['watchdog', 'cron', currentCycleId()],
    verified: false,
    category: 'heartbeat',
    status: 'committed',
    agentOrigin: 'ATLAS',
  }).catch(() => {});

  void appendAgentJournalEntry({
    agent: 'ATLAS',
    cycle: currentCycleId(),
    observation: `Sentinel watchdog ran checks: ${actions.join(', ')}.`,
    inference: failed === 0 ? 'System integrity checks passed in this cycle.' : `${failed} watchdog checks failed and require operator review.`,
    recommendation: failed === 0
      ? 'Continue scheduled watch cadence.'
      : 'Inspect failed watchdog actions and confirm CRON_SECRET / KV health before next run.',
    confidence: failed === 0 ? 0.9 : 0.62,
    derivedFrom: ['watchdog:kv-health', 'watchdog:seed-kv', 'watchdog:integrity-status'],
    relatedAgents: ['DAEDALUS', 'ZEUS'],
    status: 'committed',
    category: failed === 0 ? 'observation' : 'alert',
    severity: failed === 0 ? 'nominal' : 'elevated',
  }).catch(() => {});

  return NextResponse.json({
    ok: kvHealth.ok && seedResult.ok && giResult.ok,
    actions,
    timestamp,
  });
}
