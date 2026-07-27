import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getEveSynthesisAuthError, getServiceAuthError } from '@/lib/security/serviceAuth';

/** Cron lane: Vercel cron headers, CRON_SECRET bearer, or configured service secrets. */
export function getCronMutatingRouteAuthError(request: NextRequest): NextResponse | null {
  return getEveSynthesisAuthError(request);
}

/** Service lane: MOBIUS_SERVICE_SECRET, CRON_SECRET, RENDER_SCHEDULER_SECRET, BACKFILL_SECRET. */
export function getServiceMutatingRouteAuthError(request: NextRequest): NextResponse | null {
  return getServiceAuthError(request);
}

/** Operator UI + automation: GitHub session (NextAuth) or service/cron secrets. */
export async function getOperatorOrServiceAuthError(request: NextRequest): Promise<NextResponse | null> {
  if (getServiceAuthError(request) === null) {
    return null;
  }
  try {
    const session = await auth();
    if (session?.user) {
      return null;
    }
  } catch {
    // fall through to 401
  }
  return getServiceAuthError(request);
}
