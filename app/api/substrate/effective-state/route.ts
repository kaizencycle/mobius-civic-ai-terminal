import { NextRequest, NextResponse } from 'next/server';
import { buildSubstrateCanon } from '@/lib/substrate/canon';
import { readReplayMutationReceipt } from '@/lib/system/replay-promotion';

export const dynamic = 'force-dynamic';

type EffectiveCanonStatus = 'attested' | 'quarantined' | 'rejected' | 'pending' | 'recovered_view' | string;

type EffectiveCanonBlock = {
  seal_id: string;
  original_status: string;
  effective_status: EffectiveCanonStatus;
  replay_receipt_hash: string | null;
  has_replay_receipt: boolean;
  mutation_effective: boolean;
};

type EffectiveCanonCounts = {
  total: number;
  original_attested: number;
  original_quarantined: number;
  original_rejected: number;
  recovered_view: number;
  mutation_receipts: number;
  still_quarantined_effective: number;
};

function buildCounts(effective: EffectiveCanonBlock[]): EffectiveCanonCounts {
  return {
    total: effective.length,
    original_attested: effective.filter((b) => b.original_status === 'attested').length,
    original_quarantined: effective.filter((b) => b.original_status === 'quarantined').length,
    original_rejected: effective.filter((b) => b.original_status === 'rejected').length,
    recovered_view: effective.filter((b) => b.effective_status === 'recovered_view').length,
    mutation_receipts: effective.filter((b) => b.has_replay_receipt).length,
    still_quarantined_effective: effective.filter((b) => b.effective_status === 'quarantined').length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sealId = searchParams.get('seal_id') ?? undefined;

    const canon = await buildSubstrateCanon({ limit: 50, seal_id: sealId });

    const effective: EffectiveCanonBlock[] = await Promise.all(
      canon.reserve_blocks.map(async (b) => {
        const receiptResult = await readReplayMutationReceipt(b.seal_id);
        const replayReceiptHash = receiptResult.ok ? receiptResult.receipt.receipt_hash : null;
        const mutationEffective = Boolean(replayReceiptHash) && b.status === 'quarantined';

        return {
          seal_id: b.seal_id,
          original_status: b.status,
          effective_status: mutationEffective ? 'recovered_view' : b.status,
          replay_receipt_hash: replayReceiptHash,
          has_replay_receipt: Boolean(replayReceiptHash),
          mutation_effective: mutationEffective,
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      readonly: true,
      version: 'C-294.phase11.effective-state.v2',
      count: effective.length,
      counts: buildCounts(effective),
      effective,
      canon: [
        'Effective Canon State is derived and read-only.',
        'Original seal status remains preserved and inspectable.',
        'Replay mutation receipts create recovered_view interpretation only.',
        'No Vault, MIC, Fountain, rollback, or chain mutation occurs here.',
      ],
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'effective state failed' },
      { status: 500 },
    );
  }
}
