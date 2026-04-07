import { NextRequest, NextResponse } from 'next/server';
import { getPermissionsForRole } from '@/lib/identity/permissions';
import { getOrCreateIdentity, type MobiusIdentity } from '@/lib/identity/identityStore';
import { kvGet, kvSet } from '@/lib/kv/store';
import { getOperatorSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://mobius-browser-shell.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(_req: NextRequest) {
  const operator = await getOperatorSession();
  const username = operator?.username ?? 'kaizencycle';
  const identityKey = `identity:${username}`;
  const renderIdentityUrl = process.env.RENDER_IDENTITY_URL;
  let identity: MobiusIdentity | null = null;
  let degraded = false;

  if (renderIdentityUrl) {
    try {
      const response = await fetch(`${renderIdentityUrl}/identity/${encodeURIComponent(username)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });

      if (response.ok) {
        const payload = (await response.json()) as { identity?: MobiusIdentity } | MobiusIdentity;
        const resolved = (payload as { identity?: MobiusIdentity }).identity ?? (payload as MobiusIdentity);
        if (resolved && typeof resolved === 'object' && typeof resolved.mobius_id === 'string') {
          identity = resolved;
          await kvSet(identityKey, identity);
        }
      } else {
        degraded = true;
        console.error(`[render:identity] ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      degraded = true;
      console.error('[render:identity] request failed', error);
    }
  }

  if (!identity) {
    identity = await kvGet<MobiusIdentity>(identityKey);
  }

  if (!identity) {
    identity = await getOrCreateIdentity();
    degraded = true;
  }

  if (operator) {
    identity = {
      ...identity,
      username: operator.username,
      mobius_id: operator.mobius_id,
      mii_score: operator.mii_score,
      mic_balance: operator.mic_balance,
    };
  }

  return NextResponse.json(
    {
      ok: true,
      identity,
      degraded,
      permissions: operator?.permissions ?? getPermissionsForRole(identity.role === 'operator' ? 'developer' : identity.role),
    },
    {
      headers: CORS_HEADERS,
    },
  );
}
