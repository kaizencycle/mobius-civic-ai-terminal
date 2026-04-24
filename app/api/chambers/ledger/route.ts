import { NextResponse } from 'next/server';
import { getEchoLedger } from '@/lib/echo/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const events = getEchoLedger();
    const pending = events.filter((e) => e.status === 'pending').length;
    const confirmed = events.filter((e) => e.status === 'committed').length;
    const contested = events.filter((e) => e.status === 'reverted').length;

    return NextResponse.json({
      ok: true,
      events,
      candidates: { pending, confirmed, contested },
      dva: {
        primaryAgent: 'ECHO',
        tier: 't1',
        chambers: ['ledger'],
        promotionGate: 'ZEUS',
      },
      fallback: false,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      ok: true,
      events: [],
      candidates: { pending: 0, confirmed: 0, contested: 0 },
      dva: {
        primaryAgent: 'ECHO',
        tier: 't1',
        chambers: ['ledger'],
        promotionGate: 'ZEUS',
      },
      fallback: true,
      timestamp: new Date().toISOString(),
    });
  }
}
