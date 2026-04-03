import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type ServiceSecretName = 'MOBIUS_SERVICE_SECRET' | 'CRON_SECRET' | 'BACKFILL_SECRET';

function configuredSecrets(): Array<{ name: ServiceSecretName; value: string }> {
  // MOBIUS_SERVICE_SECRET first for outbound callers (DAEDALUS → /api/runtime/heartbeat):
  // operators set this for app/service probes; it must match what heartbeat accepts.
  // CRON_SECRET: Vercel cron still sends Authorization: Bearer ${CRON_SECRET} when set.
  // getServiceAuthError accepts any configured secret's Bearer token (trimmed, flexible parsing).
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

/** Extract secret material from Authorization (Bearer or raw), normalized for comparison. */
function extractAuthorizationToken(authorization: string | null): string | null {
  if (authorization === null) return null;
  const trimmed = authorization.trim();
  if (trimmed.length === 0) return null;
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
  const raw = bearerMatch ? bearerMatch[1].trim() : trimmed;
  return raw.length > 0 ? raw : null;
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

  const token = extractAuthorizationToken(request.headers.get('authorization'));
  const authorized =
    token !== null && secrets.some(({ value }) => token === value);

  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
