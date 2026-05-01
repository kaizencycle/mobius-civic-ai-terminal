import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/kv/store';
import { createRouterDecisionRecord, type RouterDecisionRecord, type RouterTask } from '@/lib/router/decision';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROUTER_LOG_KEY = 'router:decisions';
const MAX_LOG = 100;

async function appendDecision(record: RouterDecisionRecord) {
  const existing = (await kvGet<RouterDecisionRecord[]>(ROUTER_LOG_KEY)) ?? [];
  const next = [record, ...existing].slice(0, MAX_LOG);
  await kvSet(ROUTER_LOG_KEY, next, 60 * 60 * 24);
}

export async function POST(req: NextRequest) {
  let task: RouterTask = {};
  try {
    task = await req.json();
  } catch {
    task = {};
  }

  const record = createRouterDecisionRecord(task);
  await appendDecision(record);

  return NextResponse.json(
    {
      ok: true,
      route: record.route,
      record,
      phase: 'C-298.phase2.instrumentation',
      notes: [
        'Decision recorded to KV (capped log)',
        'No model execution performed',
        'No ledger/canon/replay mutation',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'router-decide',
      },
    },
  );
}

export async function GET() {
  const records = (await kvGet<RouterDecisionRecord[]>(ROUTER_LOG_KEY)) ?? [];

  return NextResponse.json({
    ok: true,
    version: 'C-298.phase2.router.v2',
    stored_decisions: records.length,
    sample: records.slice(0, 5),
  });
}
