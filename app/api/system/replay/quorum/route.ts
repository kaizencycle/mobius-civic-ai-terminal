import { NextResponse } from 'next/server';
import { evaluateReplayQuorum } from '@/lib/system/replay-quorum';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sealId = searchParams.get('seal_id');
  const result = await evaluateReplayQuorum(sealId);
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'replay-quorum',
    },
  });
}
