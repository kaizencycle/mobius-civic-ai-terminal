import { NextRequest, NextResponse } from 'next/server';
import { getIdentity, getIdentityPermissions } from '@/lib/identity/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username') || 'kaizencycle';
  const identity = getIdentity(username);

  return NextResponse.json({
    ok: true,
    identity,
    permissions: getIdentityPermissions(username),
  });
}
