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
  let body: any = {};
  try { body = await req.json(); } catch {}

  const record = createRouterFeedbackRecord(body);
  await append(record);

  return NextResponse.json({ ok: true, record });
}

export async function GET() {
  const records = (await kvGet<RouterFeedbackRecord[]>(KEY)) ?? [];
  return NextResponse.json({ ok: true, records });
}
