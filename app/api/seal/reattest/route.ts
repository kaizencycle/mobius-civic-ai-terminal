import { type NextRequest, NextResponse } from 'next/server';
import { reattestSeal } from '@/lib/seal/reattestSeal';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { seal_id?: string };
  if (!body.seal_id) {
    return NextResponse.json({ ok: false, reason: 'missing_seal_id' }, { status: 400 });
  }

  const result = await reattestSeal(body.seal_id);
  const status = result.ok ? 200 : 400;
  return NextResponse.json(result, { status });
}
