import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/kv/store';
import { createRouterFeedbackRecord, type RouterFeedbackRecord } from '@/lib/router/decision';

export const dynamic = 'force-dynamic';

const KEY = 'router:feedback';
const MAX = 100;

async function append(record: RouterFeedbackRecord) {
  const existing = (await kvGet<RouterFeedbackRecord[]>(KEY)) ?? [];
  const next = [record, ...existing].slice(0, MAX);
  await kvSet(KEY, next, 60 * 60 * 24);
}

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try { body = await req.json(); } catch {}
  const b = (body !== null && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const record = createRouterFeedbackRecord({
    decision_id: typeof b.decision_id === 'string' ? b.decision_id : '',
    outcome: b.outcome as RouterFeedbackRecord['outcome'],
    operator_note: typeof b.operator_note === 'string' ? b.operator_note : undefined,
    actual_cis: typeof b.actual_cis === 'number' ? b.actual_cis : undefined,
    actual_cost: typeof b.actual_cost === 'number' ? b.actual_cost : undefined,
  });
  await append(record);

  return NextResponse.json({ ok: true, record });
}

export async function GET() {
  const records = (await kvGet<RouterFeedbackRecord[]>(KEY)) ?? [];
  return NextResponse.json({ ok: true, records });
}
