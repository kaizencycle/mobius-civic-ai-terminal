import { NextRequest, NextResponse } from 'next/server';
import { getMICAccount, getOrCreateIdentity, type MICAccount } from '@/lib/identity/identityStore';
import { kvSet } from '@/lib/kv/store';

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
  const username = 'kaizencycle';
  const renderMicUrl = process.env.RENDER_MIC_URL;
  let degraded = false;
  const identity = await getOrCreateIdentity();
  let account: MICAccount | null = null;

  if (renderMicUrl) {
    try {
      const response = await fetch(`${renderMicUrl}/wallet/${encodeURIComponent(username)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });

      if (response.ok) {
        const payload = (await response.json()) as { account?: MICAccount } | MICAccount;
        const resolved = (payload as { account?: MICAccount }).account ?? (payload as MICAccount);
        if (resolved && typeof resolved === 'object' && typeof resolved.balance === 'number') {
          account = resolved;
          await kvSet(`mic:${username}`, account);
        }
      } else {
        degraded = true;
        console.error(`[render:mic] ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      degraded = true;
      console.error('[render:mic] request failed', error);
    }
  }

  if (!account) {
    account = await getMICAccount();
    degraded = true;
  }

  return NextResponse.json(
    {
      ok: true,
      degraded,
      account: {
        login: account.login,
        balance: account.balance,
        mobius_id: identity.mobius_id,
        role: identity.role,
        locked: account.locked,
        rewards_earned: account.rewards_earned,
        mic_burned: account.mic_burned,
        updated_at: account.updated_at,
      },
    },
    {
      headers: CORS_HEADERS,
    },
  );
}
