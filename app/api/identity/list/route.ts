import { NextResponse } from 'next/server';
import { listIdentities } from '@/lib/identity/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    identities: listIdentities(),
  });
}
