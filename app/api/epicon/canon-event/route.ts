/**
 * POST /api/epicon/canon-event — receive EPICON canonization events from GitHub Actions.
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const token =
    process.env.SUBSTRATE_SERVICE_TOKEN ??
    process.env.AGENT_SERVICE_TOKEN ??
    '';
  if (!token) return false;
  return bearerMatchesToken(req.headers.get('authorization'), token);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = body.event_type ?? 'UNKNOWN';

  log.info('[EPICON canon-event] received', {
    event_type: eventType,
    epicon_cycle: body.epicon_cycle,
    total_blocks: body.total_blocks,
    github_commit: body.github_commit,
    at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    recorded: true,
    event_type: eventType,
    received_at: new Date().toISOString(),
  });
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST' }, { status: 405 });
}
