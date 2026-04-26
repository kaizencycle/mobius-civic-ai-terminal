import { NextResponse } from 'next/server';
import { buildReplayPlan } from '@/lib/system/replay';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  const plan = await buildReplayPlan('dry_run');
  return NextResponse.json({
    ...plan,
    note: 'Dry run only. No KV, ledger, vault, journal, or Substrate writes were performed.',
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'replay-dry-run',
    },
  });
}
