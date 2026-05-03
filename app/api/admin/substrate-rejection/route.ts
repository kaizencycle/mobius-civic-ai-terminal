import { NextResponse } from 'next/server';
import { kvGet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rejection = await kvGet<string>('substrate:last_rejection');
  return NextResponse.json({
    ok: true,
    rejection: rejection ? JSON.parse(rejection) : null,
    timestamp: new Date().toISOString(),
  });
}
