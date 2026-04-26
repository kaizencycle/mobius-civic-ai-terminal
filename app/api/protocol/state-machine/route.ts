import { NextResponse } from 'next/server';
import { CANONICAL_STATE_MACHINE } from '@/lib/protocol/state-machine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    state_machine: CANONICAL_STATE_MACHINE,
    canon: 'Mobius protocol objects must declare lifecycle state before they are treated as canon, sealed, disputed, or immortalized.',
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'canonical-state-machine',
    },
  });
}
