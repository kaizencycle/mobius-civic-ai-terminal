import { NextResponse } from 'next/server';
import { listAllSeals } from '@/lib/vault-v2/store';
export const dynamic = 'force-dynamic';
export async function GET() {
  const seals = await listAllSeals(50);
  return NextResponse.json({ ok: true, count: seals.length, seals: seals.sort((a, b) => new Date(b.sealed_at).getTime() - new Date(a.sealed_at).getTime()), timestamp: new Date().toISOString() });
}
