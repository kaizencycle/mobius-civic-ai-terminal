import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError, serviceAuthorizationHeaderValue } from '@/lib/security/serviceAuth';

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

  const logResult = {
    seeded: seedResult.body,
    gi: giResult.body,
    kvHealth: kvHealth.body,
    timestamp,
    source: 'watchdog',
  };
  console.info('[watchdog] daily run', logResult);

  return NextResponse.json({
    ok: kvHealth.ok && seedResult.ok && giResult.ok,
    actions,
    timestamp,
  });
}
