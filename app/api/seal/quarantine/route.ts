import { NextResponse } from 'next/server';
import { listSealsByStatus } from '@/lib/seal/quarantineStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const items = await listSealsByStatus('quarantined');
  return NextResponse.json({
    ok: true,
    items: items.map((item) => ({
      seal_id: item.seal_id,
      cycle_at_seal: item.cycle_at_seal,
      status: item.status,
      quarantine_reason: item.reconciliation.quarantine_reason,
      attempt_count: item.reconciliation.attempt_count,
      last_attempt_result: item.reconciliation.last_attempt_result,
    })),
  });
}
