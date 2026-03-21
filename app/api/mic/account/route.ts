import { NextRequest, NextResponse } from 'next/server';
import { getMicAccount } from '@/lib/mic/store';
import { getIdentity } from '@/lib/identity/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const login = req.nextUrl.searchParams.get('login') || 'kaizencycle';
  const identity = getIdentity(login);
  const account = getMicAccount(login);

  return NextResponse.json({
    ok: true,
    account: {
      login: account.login,
      balance: account.balance,
      mobius_id: identity.mobius_id,
      role: identity.role,
      locked: 0,
      rewards_earned: 0,
      mic_burned: 0,
      updated_at: new Date().toISOString(),
    },
  });
}
