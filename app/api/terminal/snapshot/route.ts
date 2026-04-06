import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type JsonValue = Record<string, unknown>;

async function fetchJson(baseUrl: string, path: string): Promise<{ ok: boolean; status: number; data: JsonValue | null; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}${path}`, { cache: 'no-store' });
    const status = response.status;
    const data = (await response.json().catch(() => null)) as JsonValue | null;
    if (!response.ok) {
      return {
        ok: false,
        status,
        data,
        error: typeof data?.error === 'string' ? data.error : `Request failed (${status})`,
      };
    }
    return { ok: true, status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET(request: NextRequest) {
  const cycle = request.nextUrl.searchParams.get('cycle')?.trim();
  const baseUrl = request.nextUrl.origin;

  const journalQuery = cycle ? `?cycle=${encodeURIComponent(cycle)}` : '';

  const [
    agents,
    micro,
    kv,
    epicon,
    journal,
    sentiment,
    runtime,
    promotion,
    echo,
    integrity,
    cycleAdvance,
  ] = await Promise.all([
    fetchJson(baseUrl, '/api/agents/status'),
    fetchJson(baseUrl, '/api/signals/micro'),
    fetchJson(baseUrl, '/api/kv/health'),
    fetchJson(baseUrl, '/api/epicon/feed'),
    fetchJson(baseUrl, `/api/agents/journal${journalQuery}`),
    fetchJson(baseUrl, '/api/sentiment/composite'),
    fetchJson(baseUrl, '/api/runtime/status'),
    fetchJson(baseUrl, '/api/epicon/promotion-status'),
    fetchJson(baseUrl, '/api/echo/feed'),
    fetchJson(baseUrl, '/api/integrity-status'),
    fetchJson(baseUrl, '/api/eve/cycle-advance'),
  ]);

  const allOk = [agents, micro, kv, epicon, journal, sentiment, runtime, promotion, echo, integrity, cycleAdvance].every((item) => item.ok);

  return NextResponse.json(
    {
      ok: allOk,
      cycle: cycle ?? null,
      timestamp: new Date().toISOString(),
      data: {
        agents: agents.data,
        micro: micro.data,
        kv: kv.data,
        epicon: epicon.data,
        journal: journal.data,
        sentiment: sentiment.data,
        runtime: runtime.data,
        promotion: promotion.data,
        echo: echo.data,
        integrity: integrity.data,
        cycleAdvance: cycleAdvance.data,
      },
      status: {
        agents: agents.status,
        micro: micro.status,
        kv: kv.status,
        epicon: epicon.status,
        journal: journal.status,
        sentiment: sentiment.status,
        runtime: runtime.status,
        promotion: promotion.status,
        echo: echo.status,
        integrity: integrity.status,
        cycleAdvance: cycleAdvance.status,
      },
      errors: {
        agents: agents.error ?? null,
        micro: micro.error ?? null,
        kv: kv.error ?? null,
        epicon: epicon.error ?? null,
        journal: journal.error ?? null,
        sentiment: sentiment.error ?? null,
        runtime: runtime.error ?? null,
        promotion: promotion.error ?? null,
        echo: echo.error ?? null,
        integrity: integrity.error ?? null,
        cycleAdvance: cycleAdvance.error ?? null,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'terminal-snapshot',
      },
    },
  );
}
