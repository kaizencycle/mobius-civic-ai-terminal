import { NextRequest, NextResponse } from 'next/server';
import { readReplayMutationReceipt, previewReplayMutationPlan } from '@/lib/system/replay-promotion';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sealId = req.nextUrl.searchParams.get('seal_id');

  const [plan, receipt] = await Promise.all([
    previewReplayMutationPlan(sealId),
    readReplayMutationReceipt(sealId),
  ]);

  return NextResponse.json({
    ok: true,
    readonly: true,
    plan: plan.ok ? plan.plan : null,
    receipt: receipt.ok ? receipt.receipt : null,
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Phase': 'C-294.phase9-ui',
    },
  });
}
