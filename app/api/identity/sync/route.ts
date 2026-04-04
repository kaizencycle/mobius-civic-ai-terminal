import { NextRequest, NextResponse } from 'next/server';
import { syncIdentityRecord } from '@/lib/identity/identityStore';

export const dynamic = 'force-dynamic';

type SyncPayload = {
  username?: string;
  source?: string;
};

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const serviceSecret = process.env.MOBIUS_SERVICE_SECRET;
  const providedCronSecret = req.headers.get('x-cron-secret');
  const providedServiceSecret = req.headers.get('x-mobius-service-secret');

  if (cronSecret && providedCronSecret === cronSecret) {
    return true;
  }

  if (serviceSecret && providedServiceSecret === serviceSecret) {
    return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as SyncPayload;

  try {
    const { identity, mic } = await syncIdentityRecord(payload.username);

    return NextResponse.json({
      ok: true,
      identity,
      mic,
      source: payload.source ?? 'unknown',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync identity';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
