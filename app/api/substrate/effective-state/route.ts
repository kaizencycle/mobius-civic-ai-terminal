import { NextRequest, NextResponse } from 'next/server';
import { buildSubstrateCanon } from '@/lib/substrate/canon';

export const dynamic = 'force-dynamic';

type EffectiveCanonBlock = {
  seal_id: string;
  original_status: string;
  effective_status: string;
  replay_receipt_hash?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sealId = searchParams.get('seal_id') ?? undefined;

    const canon = await buildSubstrateCanon({ limit: 50, seal_id: sealId });

    const effective: EffectiveCanonBlock[] = canon.reserve_blocks.map((b: any) => {
      const hasReplayReceipt = Boolean(b.replay_receipt_hash);

      return {
        seal_id: b.seal_id,
        original_status: b.status,
        effective_status:
          hasReplayReceipt && b.status === 'quarantined'
            ? 'recovered_view'
            : b.status,
        replay_receipt_hash: b.replay_receipt_hash ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      count: effective.length,
      effective,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'effective state failed' },
      { status: 500 },
    );
  }
}
