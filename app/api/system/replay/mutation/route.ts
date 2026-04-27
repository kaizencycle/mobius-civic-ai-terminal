import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import {
  previewReplayMutationPlan,
  readReplayMutationReceipt,
  recordReplayMutationReceipt,
} from '@/lib/system/replay-promotion';

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
      'X-Mobius-Phase': 'C-294.phase10',
    },
  });
}

export async function POST(req: NextRequest) {
  const authErr = getServiceAuthError(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const result = await recordReplayMutationReceipt(body);

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Phase': 'C-294.phase10',
    },
  });
}
