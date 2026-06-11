// C-305 OPT-06: Force-reattest operator escape hatch.
// POST /api/vault/reattest — clears quarantine and re-queues a seal for attestation.
// GET  /api/vault/reattest — lists currently quarantined seals.

import { NextResponse } from 'next/server';
import { log } from '@/lib/log';
import { kvSetRawKey, kvGet, kvDel } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

const QUARANTINE_PREFIX = 'vault:quarantine:';
const PENDING_PREFIX = 'vault:pending:';
const HEARTBEAT_KEY = 'vault:reattest:heartbeat';

export async function POST(req: Request) {
  let body: { sealId?: string; operatorNote?: string };
  try {
    body = (await req.json()) as { sealId?: string; operatorNote?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const { sealId, operatorNote } = body;
  if (!sealId || typeof sealId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sealId)) {
    return NextResponse.json({ ok: false, error: 'sealId_required_alphanumeric' }, { status: 400 });
  }

  const ts = Date.now();
  const cycle = process.env.CURRENT_CYCLE ?? 'C-305';

  await kvDel(`${QUARANTINE_PREFIX}${sealId}`);
  await kvSetRawKey(`${PENDING_PREFIX}${sealId}`, {
    status: 'reattest_requested',
    requestedAt: ts,
    requestedBy: 'operator',
    cycle,
    operatorNote: operatorNote ?? null,
  });
  await kvSetRawKey(HEARTBEAT_KEY, { lastReattest: ts, sealId, cycle });

  log.info(`[ATLAS] Vault reattest queued: ${sealId} @ ${cycle}`);
  return NextResponse.json({ ok: true, sealId, status: 'reattest_queued', cycle, ts });
}

export async function GET() {
  const hb = await kvGet<{ lastReattest: number; sealId: string; cycle: string }>(HEARTBEAT_KEY);
  return NextResponse.json({ ok: true, heartbeat: hb ?? null });
}
