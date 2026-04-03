import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type ServiceSecretName = 'MOBIUS_SERVICE_SECRET' | 'CRON_SECRET' | 'BACKFILL_SECRET';

function trimSecret(value: string | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

/** All configured secrets — inbound routes accept Bearer for any of these. */
function configuredSecrets(): Array<{ name: ServiceSecretName; value: string }> {
  const pairs: Array<{ name: ServiceSecretName; value: string | undefined }> = [
    { name: 'CRON_SECRET', value: process.env.CRON_SECRET },
    { name: 'MOBIUS_SERVICE_SECRET', value: process.env.MOBIUS_SERVICE_SECRET },
    { name: 'BACKFILL_SECRET', value: process.env.BACKFILL_SECRET },
  ];

  return pairs
    .map(({ name, value }) => {
      const trimmed = trimSecret(value);
      return trimmed ? { name, value: trimmed } : null;
    })
    .filter((item): item is { name: ServiceSecretName; value: string } => item !== null);
}

/**
 * Bearer token for server-side outbound calls (e.g. DAEDALUS → /api/runtime/heartbeat).
 * Prefer MOBIUS_SERVICE_SECRET so internal probes match the primary service token when
 * CRON_SECRET is also set (Vercel cron still authenticates via getServiceAuthError using CRON_SECRET).
 */
export function serviceAuthorizationHeaderValue(): string | null {
  const outboundOrder: ServiceSecretName[] = [
    'MOBIUS_SERVICE_SECRET',
    'CRON_SECRET',
    'BACKFILL_SECRET',
  ];
  for (const name of outboundOrder) {
    const raw = trimSecret(process.env[name]);
    if (raw) return `Bearer ${raw}`;
  }
  return null;
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
