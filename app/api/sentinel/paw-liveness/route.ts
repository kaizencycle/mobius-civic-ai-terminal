import { NextResponse } from 'next/server';
import { kvGetSafe } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

type PawLiveness = {
  status: 'ok' | 'degraded' | 'down';
  ts: number;
  cycle?: string;
  message?: string;
};

export async function GET() {
  const paw = await kvGetSafe<PawLiveness>('atlas:paw:liveness');
  return NextResponse.json(paw ?? null);
}
