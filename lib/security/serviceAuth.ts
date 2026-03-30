import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type ServiceSecretName = 'CRON_SECRET' | 'BACKFILL_SECRET';

function configuredSecrets(): Array<{ name: ServiceSecretName; value: string }> {
  const pairs: ServiceSecretName[] = ['CRON_SECRET', 'BACKFILL_SECRET'];

  return pairs
    .map((name) => {
      const value = process.env[name];
      return typeof value === 'string' && value.trim()
        ? { name, value: value.trim() }
        : null;
    })
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
