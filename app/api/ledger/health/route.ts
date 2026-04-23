import { NextResponse } from 'next/server';
import { getAgentBearerToken } from '@/lib/substrate/client';

export const dynamic = 'force-dynamic';

function normalizeLedgerBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export async function GET() {
  const startedAt = Date.now();
  const renderLedgerUrl = normalizeLedgerBaseUrl(
    process.env.RENDER_LEDGER_URL ?? 'https://civic-protocol-core-ledger.onrender.com',
  );
  const agentToken = getAgentBearerToken();
  const authorization = agentToken.length > 0 ? `Bearer ${agentToken}` : '';

  try {
    const response = await fetch(`${renderLedgerUrl}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    return NextResponse.json({
      ok: true,
      ledgerReachable: response.ok,
      statusCode: response.status,
      responseTimeMs: Date.now() - startedAt,
      host: (() => {
        try {
          return new URL(renderLedgerUrl).host;
        } catch {
          return 'invalid-ledger-url';
        }
      })(),
      hasAgentToken: agentToken.length > 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        ledgerReachable: false,
        statusCode: null,
        responseTimeMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'unknown_error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
