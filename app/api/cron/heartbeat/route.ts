/**
 * GET/POST /api/cron/heartbeat — refresh fleet HEARTBEAT in KV (C-286).
 *
 * Schedule: every 5 minutes (`vercel.json`). Marks all canonical agents active
 * so `/api/agents/status` does not degrade on cycle-open KV gaps.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { writeFleetHeartbeatKV } from '@/lib/runtime/agent-heartbeat-kv';

export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  const authErr = getEveSynthesisAuthError(req);
  if (authErr) return authErr;

  const ok = await writeFleetHeartbeatKV('cron-heartbeat');
  const timestamp = new Date().toISOString();
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'kv_unavailable_or_write_failed', timestamp },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, timestamp, source: 'cron-heartbeat' });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
