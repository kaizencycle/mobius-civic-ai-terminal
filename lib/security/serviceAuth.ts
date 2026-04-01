import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Server-only: POST /api/eve/cycle-synthesize sends this header so internal pipeline steps skip Bearer while staying secret-gated. */
export const EVE_PIPELINE_INTERNAL_HEADER = 'x-mobius-eve-pipeline';

type ServiceSecretName = 'CRON_SECRET' | 'BACKFILL_SECRET';

export type ServiceAuthOptions = {
  allowEvePipelineInternal?: boolean;
};

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

export function getServiceAuthError(
  request: NextRequest,
  options?: ServiceAuthOptions,
): NextResponse | null {
  const backfill = process.env.BACKFILL_SECRET?.trim();
  if (options?.allowEvePipelineInternal && backfill) {
    const internal = request.headers.get(EVE_PIPELINE_INTERNAL_HEADER);
    if (internal === backfill) {
      return null;
    }
  }

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
