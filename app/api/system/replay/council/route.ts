import { NextResponse } from 'next/server';
import { readReplayCouncil, submitReplayCouncilMessage } from '@/lib/system/replay-quorum';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sealId = searchParams.get('seal_id');
  const result = await readReplayCouncil(sealId);
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'replay-council',
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await submitReplayCouncilMessage(body);
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'replay-council',
    },
  });
}
