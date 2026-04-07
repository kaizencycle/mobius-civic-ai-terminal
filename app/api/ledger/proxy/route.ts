import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function normalizeLedgerBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('target');
  const path = target === 'chain' ? '/ledger/chain' : target === 'stats' ? '/ledger/stats' : '';
  if (!path) {
    return NextResponse.json({ ok: false, error: 'invalid_target' }, { status: 400 });
  }

  const baseUrl = normalizeLedgerBaseUrl(
    process.env.RENDER_LEDGER_URL ?? 'https://civic-protocol-core-ledger.onrender.com',
  );
  const apiKey = process.env.RENDER_API_KEY ?? '';
  const authorization = apiKey.trim().length > 0 ? `Bearer ${apiKey}` : '';

  try {
    const health = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!health.ok) {
      return NextResponse.json({ ok: false, error: `ledger_health_http_${health.status}` }, { status: 503 });
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    const body = await res.text();
    let data: unknown = null;
    if (body) {
      try {
        data = JSON.parse(body);
      } catch {
        data = { raw: body };
      }
    }
    return NextResponse.json({ ok: res.ok, target, data, statusCode: res.status }, { status: res.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'ledger_proxy_failed' },
      { status: 503 },
    );
  }
}
