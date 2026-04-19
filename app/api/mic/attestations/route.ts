/**
 * GET /api/mic/attestations
 *
 * MIC_REWARD_V2-shaped summaries derived from recent `vault:deposits` rows.
 * Not ledger node attestations — placeholder until substrate exposes `/mic/attestations`.
 */

import { NextResponse } from 'next/server';
import type { MicRewardAttestationSummary } from '@/lib/mic/types';
import { listVaultDeposits } from '@/lib/vault/vault';

export const dynamic = 'force-dynamic';

export async function GET() {
  const limitParam = 40;
  const deposits = await listVaultDeposits(limitParam);

  const rows: MicRewardAttestationSummary[] = deposits.map((d) => {
    const j = d.journal_score;
    const wg = j > 0 && Number.isFinite(j) ? Number((d.deposit_amount / j).toFixed(4)) : undefined;
    return {
      nodeId: `${d.agent}:${d.journal_id}`,
      mic: d.deposit_amount,
      timestamp: d.timestamp,
      source: 'vault_deposit_summary' as const,
      breakdown: {
        integrity: d.journal_score,
        multipliers: {
          giMultiplier: wg,
        },
      },
    };
  });

  return NextResponse.json(
    { ok: true, schema: 'MIC_REWARD_V2_SUMMARY', rows },
    { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'mic-attestations-deposit-proxy' } },
  );
}
