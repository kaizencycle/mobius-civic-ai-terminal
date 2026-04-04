import { NextRequest, NextResponse } from 'next/server';
import { getPermissionsForRole } from '@/lib/identity/permissions';
import { getOrCreateIdentity } from '@/lib/identity/identityStore';

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
  const identity = await getOrCreateIdentity();

  return NextResponse.json(
    {
      ok: true,
      identity,
      permissions: getPermissionsForRole(identity.role === 'operator' ? 'developer' : identity.role),
    },
    {
      headers: CORS_HEADERS,
    },
  );
}
