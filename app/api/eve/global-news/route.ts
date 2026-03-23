/**
 * GET /api/eve/global-news
 *
 * EVE global news synthesis endpoint.
 * Returns structured items, pattern notes, dominant region/category,
 * and a global tension assessment.
 *
 * CC0 Public Domain
 */

import { NextResponse } from 'next/server';

import { fetchEveGlobalNews } from '@/lib/eve/global-news';

export const dynamic = 'force-dynamic';

let cached:
  | {
      data: Awaited<ReturnType<typeof fetchEveGlobalNews>>;
      ts: number;
    }
  | null = null;

const CACHE_TTL_MS = 3 * 60 * 1000;

export async function GET() {
  const now = Date.now();

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ok: true, cached: true, ...cached.data },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
          'X-Mobius-Source': 'eve-global-news-cached',
          'X-Mobius-Agent': 'EVE',
        },
      }
    );
  }

  try {
    const synthesis = await fetchEveGlobalNews();
    cached = { data: synthesis, ts: now };

    return NextResponse.json(
      { ok: true, cached: false, ...synthesis },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
          'X-Mobius-Source': 'eve-global-news-live',
          'X-Mobius-Agent': 'EVE',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
