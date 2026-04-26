import { NextResponse } from 'next/server';
import { buildReplayPlan } from '@/lib/system/replay';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const plan = await buildReplayPlan('plan');
  return NextResponse.json(plan, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'replay-plan',
    },
  });
}
