import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError, serviceAuthorizationHeaderValue } from '@/lib/security/serviceAuth';
import { appendAgentJournalEntry } from '@/lib/agents/journal';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';

/**
 * C-274: Runtime maintenance is currently once-daily (Vercel cron). If heartbeat,
 * journal/archive merge, or promotion normalization need tighter cadence, extend
 * this handler (or add schedules) in one place — avoid per-lane commit spam.
 */
export const dynamic = 'force-dynamic';

type WatchdogActionResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

function getInternalAuthorizationHeader(): string | null {
  const outbound = serviceAuthorizationHeaderValue();
  if (outbound) return outbound;

  const candidates = [process.env.CRON_SECRET, process.env.RENDER_SCHEDULER_SECRET];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return `Bearer ${raw.trim()}`;
    }
  }
  return null;
}

async function fetchWithTimeout(
  request: NextRequest,
  path: string,
  init?: RequestInit,
): Promise<WatchdogActionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  const authorization = getInternalAuthorizationHeader();
  const headers = new Headers(init?.headers);

  if (authorization && !headers.has('authorization')) {
    headers.set('authorization', authorization);
  }

  try {
    const response = await fetch(new URL(path, request.nextUrl.origin), {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });

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
      body: { error: error instanceof Error ? error.message : 'Unknown fetch error' },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest) {
  const authError = getServiceAuthError(request);
  if (authError) return authError;

  const actions: string[] = [];
  const timestamp = new Date().toISOString();

  const kvHealth = await fetchWithTimeout(request, '/api/kv/health');
  actions.push(`kv-health:${kvHealth.ok ? 'ok' : `fail:${kvHealth.status}`}`);

  const seedResult = await fetchWithTimeout(request, '/api/admin/seed-kv', { method: 'POST' });
  actions.push(`seed-kv:${seedResult.ok ? 'ok' : `fail:${seedResult.status}`}`);

  const giResult = await fetchWithTimeout(request, '/api/integrity-status');
  actions.push(`integrity-status:${giResult.ok ? 'ok' : `fail:${giResult.status}`}`);

  const tripwireResult = await fetchWithTimeout(request, '/api/tripwire/status');
  actions.push(`tripwire-state:${tripwireResult.ok ? 'ok' : `fail:${tripwireResult.status}`}`);

  const echoResult = await fetchWithTimeout(request, '/api/echo/ingest', { method: 'POST' });
  actions.push(`echo-ingest:${echoResult.ok ? 'ok' : `fail:${echoResult.status}`}`);

  const promoteResult = await fetchWithTimeout(request, '/api/epicon/promote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxItems: 5 }),
  });
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
