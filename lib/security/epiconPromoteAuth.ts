/**
 * Shared auth gate for POST /api/epicon/promote.
 * EPICON: C-370 — cron/promote 401 when SUBSTRATE_TOKEN stale but CRON_SECRET valid.
 *
 * Accepts (in order):
 *   1. Vercel cron invocation
 *   2. CRON_SECRET bearer
 *   3. SUBSTRATE_TOKEN bearer (terminal internal secret)
 *   4. MOBIUS_SERVICE_SECRET / other serviceAuth secrets
 *   5. Open when no secrets configured (local dev)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getServiceAuthError,
  isValidCronSecretBearer,
  isVercelCronInvocation,
  normalizeServiceSecretMaterial,
} from '@/lib/security/serviceAuth';

export function getEpiconPromoteAuthError(request: NextRequest): NextResponse | null {
  if (isVercelCronInvocation(request)) return null;
  if (isValidCronSecretBearer(request.headers.get('authorization'))) return null;

  const bearerMat = normalizeServiceSecretMaterial(request.headers.get('authorization') ?? undefined);
  const substrateMat = normalizeServiceSecretMaterial(process.env.SUBSTRATE_TOKEN);
  if (substrateMat && bearerMat === substrateMat) return null;

  const serviceErr = getServiceAuthError(request);
  if (!serviceErr) return null;

  if (serviceErr.status === 503 && !substrateMat) {
    return null;
  }

  const hint = !bearerMat
    ? 'caller sent no Authorization header — use CRON_SECRET, MOBIUS_SERVICE_SECRET, or SUBSTRATE_TOKEN'
    : 'token mismatch — verify SUBSTRATE_TOKEN/CRON_SECRET matches the cron caller env';

  return NextResponse.json({ error: 'invalid_token', hint }, { status: 401 });
}

/** Build Authorization for in-process promote calls (cron/watchdog). */
export function epiconPromoteAuthorizationHeader(): string | null {
  const order = [
    process.env.CRON_SECRET,
    process.env.MOBIUS_SERVICE_SECRET,
    process.env.SUBSTRATE_TOKEN,
    process.env.RENDER_SCHEDULER_SECRET,
  ];
  for (const raw of order) {
    const mat = normalizeServiceSecretMaterial(raw);
    if (mat) return `Bearer ${mat}`;
  }
  return null;
}

export function makeEpiconPromoteRequest(origin: string, body: { maxItems: number }): Request {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'x-internal-cron': '1',
  });
  const auth = epiconPromoteAuthorizationHeader();
  if (auth) headers.set('authorization', auth);

  return new Request(new URL('/api/epicon/promote', origin), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
