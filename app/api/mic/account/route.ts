import { NextRequest, NextResponse } from 'next/server';
import { getMICAccount, getOrCreateIdentity } from '@/lib/identity/identityStore';

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
  const [identity, account] = await Promise.all([getOrCreateIdentity(), getMICAccount()]);

  return NextResponse.json(
    {
      ok: true,
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
