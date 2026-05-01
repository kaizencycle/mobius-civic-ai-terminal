import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      phase: 'C-298.phase8.router-ui-signals',
      advisory: true,
      signals: [
        {
          type: 'warning',
          message: 'Routing recommendations available (Phase 7).',
        },
        {
          type: 'info',
          message: 'Automation Index advisory loaded (no execution).',
        },
      ],
      canon_law: [
        'Signals are advisory only.',
        'No routing decisions are enforced.',
        'No mutation of Canon, Ledger, Vault, or Replay occurs.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  );
}
