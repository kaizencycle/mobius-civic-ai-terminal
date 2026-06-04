import { NextRequest, NextResponse } from 'next/server';
import { GET as getJournal } from '@/app/api/chambers/journal/route';
import { kvSetRawKey } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

// C-305 OPT-05: POST handler — KV dual-write + heartbeat + substrate bridge
export async function POST(request: NextRequest) {
  let entry: Record<string, unknown>;
  try {
    entry = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const ts = Date.now();
  const cycle = (entry.cycle as string | undefined) ?? process.env.CURRENT_CYCLE ?? 'C-305';
  const agent = ((entry.agent ?? entry.agentOrigin) as string | undefined) ?? 'unknown';
  const kvKey = `journal:${agent.toLowerCase()}:${ts}`;

  const wrote = await kvSetRawKey(kvKey, { ...entry, writtenAt: ts, source: 'terminal-bridge' });
  if (!wrote) {
    console.error('[HERMES] Journal KV write failed — Redis unavailable and no bridge fallback.');
    return NextResponse.json({ ok: false, error: 'kv_write_failed', key: kvKey }, { status: 503 });
  }
  await kvSetRawKey('journal:heartbeat', { lastWrite: ts, lastCycle: cycle, lastKey: kvKey });

  const ledgerUrl = process.env.CIVIC_LEDGER_URL;
  // C-332 OPT-2: the substrate bridge was fire-and-forget — a failed bridge still
  // returned ok:true, so the response claimed full success while the ledger never
  // received the entry (silent attestation gap, Priority A). Await it and report
  // bridge status in the response. KV remains the source of truth either way.
  let bridge: { ok: boolean; status?: number; error?: string } = { ok: false, error: 'not_attempted' };
  if (ledgerUrl) {
    try {
      const res = await fetch(ledgerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUBSTRATE_TOKEN ?? process.env.AGENT_SERVICE_TOKEN ?? ''}`,
        },
        body: JSON.stringify({ ...entry, source: 'terminal-bridge', bridgedAt: ts }),
      });
      bridge = res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status };
      if (!res.ok) {
        console.warn(`[HERMES] Journal substrate bridge non-OK ${res.status} — KV preserved`);
      }
    } catch (err: unknown) {
      bridge = { ok: false, error: (err as Error)?.message ?? 'bridge_failed' };
      console.warn('[HERMES] Journal substrate bridge failed — KV preserved:', (err as Error)?.message);
    }
  }

  return NextResponse.json({ ok: true, key: kvKey, ts, bridge });
}

export async function GET(request: NextRequest) {
  try {
    const response = await getJournal(request);
    const payload = (await response.json()) as Record<string, unknown>;
    return NextResponse.json(
      {
        ...payload,
        ok: payload.ok === false ? false : true,
        degraded: payload.fallback === true,
        error: null,
      },
      { status: 200 },
    );
  } catch (error) {
    const mode = request.nextUrl.searchParams.get('mode') ?? 'merged';
    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        fallback: true,
        error: error instanceof Error ? error.message : 'journal_route_failed',
        mode,
        entries: [],
        canonical_available: false,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
