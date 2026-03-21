import { NextRequest, NextResponse } from 'next/server';
import { getMicAccount } from '@/lib/mic/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const login = req.nextUrl.searchParams.get('login') || 'kaizencycle';
  const account = getMicAccount(login);

  return NextResponse.json({
    ok: true,
    account: {
      login: account.login,
      balance: account.balance,
      locked: 0,
      rewards_earned: 0,
      mic_burned: 0,
      updated_at: new Date().toISOString(),
    },
  });
}
