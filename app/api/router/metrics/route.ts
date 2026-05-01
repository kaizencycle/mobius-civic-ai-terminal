import { NextResponse } from 'next/server';
import { kvGet } from '@/lib/kv/store';
import { summarizeRouterDecisions, type RouterDecisionRecord } from '@/lib/router/decision';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROUTER_LOG_KEY = 'router:decisions';

export async function GET() {
  const records = (await kvGet<RouterDecisionRecord[]>(ROUTER_LOG_KEY)) ?? [];
  const summary = summarizeRouterDecisions(records);

  return NextResponse.json(
    {
      ok: true,
      phase: 'C-298.phase2.instrumentation',
      summary,
      recent: records.slice(0, 20),
      canon_law: [
        'Router metrics are observational only in Phase 2.',
        'No execution, no model calls, no ledger mutation.',
        'CIS is placeholder until verification layer is wired.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'router-metrics',
      },
    },
  );
}
