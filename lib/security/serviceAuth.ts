import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type ServiceSecretName = 'MOBIUS_SERVICE_SECRET' | 'CRON_SECRET' | 'BACKFILL_SECRET';

function configuredSecrets(): Array<{ name: ServiceSecretName; value: string }> {
  // MOBIUS_SERVICE_SECRET first for outbound Authorization (DAEDALUS self-ping, etc.):
  // operators typically set the service token in Vercel; CRON_SECRET may differ or be
  // absent in preview. Inbound verification still accepts CRON_SECRET (Vercel cron
  // sends Bearer ${CRON_SECRET}), MOBIUS_SERVICE_SECRET, and BACKFILL_SECRET.
  const pairs: Array<{ name: ServiceSecretName; value: string | undefined }> = [
    { name: 'MOBIUS_SERVICE_SECRET', value: process.env.MOBIUS_SERVICE_SECRET },
    { name: 'CRON_SECRET', value: process.env.CRON_SECRET },
    { name: 'BACKFILL_SECRET', value: process.env.BACKFILL_SECRET },
  ];

  return pairs
    .map(({ name, value }) => (typeof value === 'string' && value.trim()
      ? { name, value: value.trim() }
      : null))
    .filter((item): item is { name: ServiceSecretName; value: string } => item !== null);
}

export function serviceAuthorizationHeaderValue(): string | null {
  const [primary] = configuredSecrets();
  return primary ? `Bearer ${primary.value}` : null;
}

export function getServiceAuthError(request: NextRequest): NextResponse | null {
  const secrets = configuredSecrets();
  if (secrets.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Service authorization is not configured' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  const authorized = secrets.some(({ value }) => auth === `Bearer ${value}`);

  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
