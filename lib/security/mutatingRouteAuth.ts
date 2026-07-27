import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { getOperatorSession } from '@/lib/auth/session';
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
