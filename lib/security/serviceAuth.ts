import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type ServiceSecretName = 'MOBIUS_SERVICE_SECRET' | 'CRON_SECRET' | 'BACKFILL_SECRET';

function configuredSecrets(): Array<{ name: ServiceSecretName; value: string }> {
  // Inbound: accept Bearer for any configured secret (order does not matter).
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

/** First non-empty secret for outbound Authorization (MOBIUS first so internal fetches match ops / GitHub Actions). */
function outboundBearerMaterial(): string | null {
  const order: ServiceSecretName[] = ['MOBIUS_SERVICE_SECRET', 'CRON_SECRET', 'BACKFILL_SECRET'];
  for (const name of order) {
    const raw = process.env[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
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
  const material = outboundBearerMaterial();
  return material ? `Bearer ${material}` : null;
}

/**
 * True when this request is Vercel’s scheduled cron HTTP GET (production).
 * Vercel documents User-Agent `vercel-cron/1.0` and may send `x-vercel-cron`;
 * some deployments differ slightly on User-Agent. Used only by
 * /api/runtime/heartbeat so scheduled cron can run when auth headers are absent
 * or differ from app secrets (still production-only).
 */
export function isVercelCronInvocation(request: NextRequest): boolean {
  if (process.env.VERCEL !== '1') return false;
  const cronMarker = request.headers.get('x-vercel-cron');
  if (cronMarker !== null && cronMarker.trim() !== '') {
    return true;
  }
  const ua = request.headers.get('user-agent') ?? '';
  return /^vercel-cron\//i.test(ua.trim());
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
