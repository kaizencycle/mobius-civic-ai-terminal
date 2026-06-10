import { NextResponse } from 'next/server';
import { kvGet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // C-338 fix: @upstash/redis auto-deserializes JSON values on GET, so this
    // key may arrive as an object. The previous unconditional JSON.parse threw
    // on objects → 500, hiding the very breadcrumb this route exists to show.
    const raw = await kvGet<unknown>('substrate:last_rejection');
    const rejection =
      typeof raw === 'string'
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return { raw };
            }
          })()
        : raw;
    return NextResponse.json({
      ok: true,
      rejection: rejection ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'kv_read_failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
