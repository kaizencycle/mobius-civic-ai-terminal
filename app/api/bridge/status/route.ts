import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  let integrity: { cycle?: string; global_integrity?: number; mode?: string } | null = null;
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/api/integrity-status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) integrity = await res.json();
  } catch {
    /* degraded — proceed with nulls */
  }

  const terminalUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mobius-civic-ai-terminal.vercel.app';

  return NextResponse.json(
    {
      ok: true,
      terminal: {
        url: terminalUrl,
        onboard: `${terminalUrl}/terminal/globe?from=shell`,
        chambers: ['globe', 'pulse', 'signals', 'sentinel', 'ledger', 'journal', 'vault'],
      },
      integrity: integrity
        ? {
            cycle: integrity.cycle ?? null,
            gi: integrity.global_integrity ?? null,
            mode: integrity.mode ?? null,
          }
        : null,
      substrate: 'https://github.com/kaizencycle/Mobius-Substrate',
      timestamp: new Date().toISOString(),
    },
    { headers: { ...(cors ?? {}) } },
  );
}
