import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type ServiceSecretName = 'MOBIUS_SERVICE_SECRET' | 'CRON_SECRET' | 'BACKFILL_SECRET';

/**
 * Normalize secret material from env: trim, strip one layer of surrounding quotes,
 * strip an optional `Bearer ` prefix. Aligns stored values with
 * `extractAuthorizationToken()` so `Authorization: Bearer <secret>` and outbound
 * `serviceAuthorizationHeaderValue()` stay consistent when ops paste
 * `Bearer …` or quoted values into Vercel.
 */
function normalizeServiceSecretMaterial(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (s.length === 0) return null;
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  if (s.length === 0) return null;
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(s);
  if (bearerMatch) {
    s = bearerMatch[1].trim();
  }
  return s.length > 0 ? s : null;
}

function configuredSecrets(): Array<{ name: ServiceSecretName; value: string }> {
  // Inbound: accept Bearer for any configured secret (order does not matter).
  const pairs: Array<{ name: ServiceSecretName; value: string | undefined }> = [
    { name: 'MOBIUS_SERVICE_SECRET', value: process.env.MOBIUS_SERVICE_SECRET },
    { name: 'CRON_SECRET', value: process.env.CRON_SECRET },
    { name: 'BACKFILL_SECRET', value: process.env.BACKFILL_SECRET },
  ];

  return pairs
    .map(({ name, value }) => {
      const normalized = normalizeServiceSecretMaterial(value);
      return normalized !== null ? { name, value: normalized } : null;
    })
    .filter((item): item is { name: ServiceSecretName; value: string } => item !== null);
}

/** First non-empty normalized secret for outbound Authorization (MOBIUS first so probes match sentinel / ops). */
function outboundBearerMaterial(): string | null {
  const order: ServiceSecretName[] = ['MOBIUS_SERVICE_SECRET', 'CRON_SECRET', 'BACKFILL_SECRET'];
  for (const name of order) {
    const normalized = normalizeServiceSecretMaterial(process.env[name]);
    if (normalized !== null) return normalized;
  }
  return null;
}

/** Extract secret material from Authorization (Bearer or raw). Do not normalize here — normalization is env-specific. */
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
 * some invocations use a UA that contains `vercel-cron` without the `vercel-cron/`
 * prefix form. Used only by /api/runtime/heartbeat so scheduled cron can run when
 * auth headers are absent or differ from app secrets (still production-only).
 */
export function isVercelCronInvocation(request: NextRequest): boolean {
  if (process.env.VERCEL !== '1') return false;
  const cronMarker = request.headers.get('x-vercel-cron');
  if (cronMarker !== null && cronMarker.trim() !== '') {
    return true;
  }
  const ua = (request.headers.get('user-agent') ?? '').trim();
  return /vercel-cron/i.test(ua);
}

/**
 * Vercel injects `Authorization: Bearer ${CRON_SECRET}` on cron invocations when
 * CRON_SECRET is set (see Vercel cron docs). That header is checked before the
 * generic service-secret list so scheduled `/api/runtime/heartbeat` succeeds when
 * MOBIUS_SERVICE_SECRET and CRON_SECRET differ.
 *
 * Compare using the same normalization as inbound service auth (quotes, embedded
 * `Bearer ` in env or token) so ops-pasted values and Vercel’s header stay aligned.
 */
export function isValidCronSecretBearer(authorization: string | null): boolean {
  const cronEnv = process.env.CRON_SECRET;
  const cronMaterial = normalizeServiceSecretMaterial(cronEnv);
  if (cronMaterial === null) return false;

  const token = extractAuthorizationToken(authorization);
  if (token === null) return false;
  const tokenMaterial = normalizeServiceSecretMaterial(token);
  return tokenMaterial !== null && tokenMaterial === cronMaterial;
}

export function getServiceAuthError(request: NextRequest): NextResponse | null {
  const secrets = configuredSecrets();
  if (secrets.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Service authorization is not configured' },
      { status: 503 },
    );
  }

  const rawToken = extractAuthorizationToken(request.headers.get('authorization'));
  const token =
    rawToken !== null ? normalizeServiceSecretMaterial(rawToken) : null;
  const authorized =
    token !== null &&
    secrets.some(({ value }) => token === value);

  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
