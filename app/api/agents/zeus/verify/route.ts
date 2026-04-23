/**
 * POST /api/agents/zeus/verify — ZEUS cycle verification journal (cron / post-EVE).
 * Distinct from POST /api/zeus/verify (single EPICON candidate verification).
 * Auth: same as EVE cycle synthesis.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { appendZeusCronJournal, parseZeusCronBody } from '@/lib/agents/sentinel-cycle-journals';
import { loadGIState } from '@/lib/kv/store';
import { writeMiiState } from '@/lib/kv/mii';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST JSON { cycle, gi?, atlasEntry?, source?: "cron" } — ZEUS verification journal write',
  });
}

export async function POST(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
  if (authErr) return authErr;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseZeusCronBody(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: 'cycle (string) is required' }, { status: 400 });
  }

  let gi = parsed.gi;
  try {
    const st = await loadGIState();
    if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
      gi = Math.max(0, Math.min(1, st.global_integrity));
    }
  } catch {
    // use body gi
  }

  try {
    const entry = await appendZeusCronJournal({ ...parsed, gi });
    const ts = new Date().toISOString();
    await writeMiiState({
      agent: 'ZEUS',
      mii: Number(entry.confidence.toFixed(4)),
      gi,
      cycle: parsed.cycle,
      timestamp: ts,
      source: 'live',
    });
    return NextResponse.json({
      ok: true,
      agent: 'ZEUS',
      journalId: entry.id,
      journal: entry,
      cycle: parsed.cycle,
      gi,
      atlasEntry: parsed.atlasEntry ?? null,
      source: parsed.source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ZEUS verify journal failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
