import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { authorizeReplayPromotion } from '@/lib/system/replay-promotion';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authErr = getServiceAuthError(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const result = await authorizeReplayPromotion(body);

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Phase': 'C-294.phase7',
    },
  });
}
