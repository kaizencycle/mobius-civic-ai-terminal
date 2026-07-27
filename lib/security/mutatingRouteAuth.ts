import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { getOperatorSession } from '@/lib/auth/session';
import { getServerWriteCircuitBreakerError } from '@/lib/gi/serverWriteCircuitBreaker';
import { getServiceAuthError } from '@/lib/security/serviceAuth';

/**
 * Mutating cron lane (e.g. cycle-advance POST): configured service secrets only.
 * Does not use {@link getEveSynthesisAuthError} — spoofable `x-vercel-cron-*` /
 * User-Agent markers must not authorize ledger/cycle writes.
 */
export function getCronMutatingRouteAuthError(request: NextRequest): NextResponse | null {
  return getServiceAuthError(request);
}

/** Service lane: MOBIUS_SERVICE_SECRET, CRON_SECRET, RENDER_SCHEDULER_SECRET, BACKFILL_SECRET. */
export function getServiceMutatingRouteAuthError(request: NextRequest): NextResponse | null {
  return getServiceAuthError(request);
}

/** Operator UI + automation: full operator session (githubUsername + mobius_id) or service secrets. */
export async function getOperatorOrServiceAuthError(request: NextRequest): Promise<NextResponse | null> {
  if (getServiceAuthError(request) === null) {
    return null;
  }
  const operator = await getOperatorSession();
  if (operator) {
    return null;
  }
  return getServiceAuthError(request);
}

/** Service mutating routes that must respect server GI write circuit breaker (seal, shards). */
export async function getServiceMutatingRouteWithBreakerError(
  request: NextRequest,
): Promise<NextResponse | null> {
  const authErr = getServiceMutatingRouteAuthError(request);
  if (authErr) return authErr;
  return getServerWriteCircuitBreakerError();
}

/** Service or operator session (shard commit) with server GI write circuit breaker. */
export async function getServiceOrOperatorWithBreakerError(
  request: NextRequest,
): Promise<NextResponse | null> {
  const serviceOk = getServiceAuthError(request) === null;
  if (!serviceOk) {
    const operator = await getOperatorSession();
    if (!operator) return getServiceAuthError(request);
  }
  return getServerWriteCircuitBreakerError();
}

/** Operator mutating routes with server GI write circuit breaker (integrity grade). */
export async function getOperatorOrServiceWithBreakerError(
  request: NextRequest,
): Promise<NextResponse | null> {
  const authErr = await getOperatorOrServiceAuthError(request);
  if (authErr) return authErr;
  return getServerWriteCircuitBreakerError();
}
