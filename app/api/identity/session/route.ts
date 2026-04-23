import { NextResponse } from 'next/server';
import { getOperatorSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOperatorSession();
  return NextResponse.json({ ok: true, user });
}
