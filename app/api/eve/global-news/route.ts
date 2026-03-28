/**
 * GET /api/eve/global-news
 *
 * EVE global news synthesis endpoint.
 * Returns structured items, pattern notes, dominant region/category,
 * and a global tension assessment.
 *
 * CC0 Public Domain
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { fetchEveGlobalNews } from '@/lib/eve/global-news';
import { triggerEveSynthesisPipelineAfterObservation } from '@/lib/eve/global-news-pipeline-trigger';
import { mockEveNews } from '@/lib/mock-data';
import {
  isFresh,
  liveEnvelope,
  mockEnvelope,
  staleCacheEnvelope,
} from '@/lib/response-envelope';

export const dynamic = 'force-dynamic';

let cached:
  | {
      data: Awaited<ReturnType<typeof fetchEveGlobalNews>>;
      ts: number;
    }
  | null = null;

const CACHE_TTL_MS = 3 * 60 * 1000;

function serverBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

export async function GET(request: NextRequest) {
  const now = Date.now();

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    const freshItems = cached.data.items.filter((item) =>
      isFresh(item.timestamp, 48 * 60 * 60 * 1000)
    );
    if (freshItems.length === 0) {
      const items = mockEveNews();
      return NextResponse.json(
        {
          ok: true,
          ...mockEnvelope('EVE live feed returned no fresh items'),
          cached: true,
          ...cached.data,
          total_items: items.length,
          items,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
            'X-Mobius-Source': 'eve-global-news-cached',
            'X-Mobius-Agent': 'EVE',
          },
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        ...liveEnvelope(cached.data.timestamp),
        cached: true,
        ...cached.data,
        total_items: freshItems.length,
        items: freshItems,
      },
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
    const freshItems = synthesis.items.filter((item) =>
      isFresh(item.timestamp, 48 * 60 * 60 * 1000)
    );
    if (freshItems.length === 0) {
      const items = mockEveNews();
      return NextResponse.json(
        {
          ok: true,
          ...mockEnvelope('EVE live feed returned no fresh items'),
          cached: false,
          ...synthesis,
          total_items: items.length,
          items,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
            'X-Mobius-Source': 'eve-global-news-live',
            'X-Mobius-Agent': 'EVE',
          },
        }
      );
    }

    const freshSynthesis = {
      ...synthesis,
      total_items: freshItems.length,
      items: freshItems,
    };
    cached = { data: freshSynthesis, ts: now };

    triggerEveSynthesisPipelineAfterObservation(serverBaseUrl(request));

    return NextResponse.json(
      { ok: true, ...liveEnvelope(synthesis.timestamp), cached: false, ...freshSynthesis },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
          'X-Mobius-Source': 'eve-global-news-live',
          'X-Mobius-Agent': 'EVE',
        },
      }
    );
  } catch (error) {
    if (cached) {
      return NextResponse.json(
        {
          ok: true,
          ...staleCacheEnvelope(cached.data.timestamp, 'EVE live feed unavailable'),
          cached: true,
          ...cached.data,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
            'X-Mobius-Source': 'eve-global-news-stale-cache',
            'X-Mobius-Agent': 'EVE',
          },
        }
      );
    }

    const items = mockEveNews();
    console.error('EVE global-news fetch failed', error);
    return NextResponse.json(
      {
        ok: true,
        ...mockEnvelope('EVE live feed unavailable'),
        cached: false,
        timestamp: new Date().toISOString(),
        agent: 'EVE',
        total_items: items.length,
        items,
        pattern_notes: ['No live items available - EVE feed degraded gracefully'],
        dominant_region: 'Global',
        dominant_category: 'geopolitical',
        global_tension: 'low',
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
          'X-Mobius-Source': 'eve-global-news-mock',
          'X-Mobius-Agent': 'EVE',
        },
      }
    );
  }
}
