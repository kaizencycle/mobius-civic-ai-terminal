import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await computeIntegrityPayload();
  return NextResponse.json({ ok: true as const, ...payload });
}
