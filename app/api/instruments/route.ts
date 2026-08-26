/**
 * GET /api/instruments
 *
 * C-412 — Composed protocol snapshot for World Renderer (MOBIUS_INSTRUMENTS_1).
 * Public read; CORS via handbook allowlist. Composes snapshot-lite + micro + integrity + KV health.
 *
 * CC0 Public Domain
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import { composeInstrumentsSnapshot } from '@/lib/instruments/composeInstrumentsSnapshot';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
  'X-Mobius-Source': 'instruments-facade',
} as const;

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  const baseUrl = new URL(req.url).origin;

  try {
    const body = await composeInstrumentsSnapshot(baseUrl);
    return NextResponse.json(body, {
      headers: {
        ...(cors ?? {}),
        ...CACHE_HEADERS,
      },
    });
  } catch (error) {
    console.error('[instruments] compose failed:', error);
    const msg = error instanceof Error ? error.message : 'instruments_compose_failed';
    return NextResponse.json(
      {
        schema_version: 'MOBIUS_INSTRUMENTS_1',
        ok: false,
        degraded: true,
        error: msg,
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          ...(cors ?? {}),
          ...CACHE_HEADERS,
        },
      },
    );
  }
}
