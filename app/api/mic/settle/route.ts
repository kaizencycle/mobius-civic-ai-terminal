import { NextRequest, NextResponse } from 'next/server';
import { settleEpiconClaim } from '@/lib/mic/settle';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const result = settleEpiconClaim({
      epicon_id: body.epicon_id,
      outcome: body.outcome,
    });

    return NextResponse.json({
      ok: true,
      settlement: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Settlement failed',
      },
      { status: 400 },
    );
  }
}
