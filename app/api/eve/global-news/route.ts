/**
 * GET /api/eve/global-news
 *
 * EVE synthesis endpoint.
 * Prioritizes live external observations, but always injects
 * an internal governance / ethics / civic-risk synthesis lane.
 */

import type { NextRequest } from 'next/server';
import { after, NextResponse } from 'next/server';

import { buildAndCommitEveInternalSynthesis } from '@/lib/eve/internal-synthesis';
import { type EveSynthesis, fetchEveGlobalNews } from '@/lib/eve/global-news';
import { triggerEveSynthesisPipelineAfterObservation } from '@/lib/eve/global-news-pipeline-trigger';
import { mockEveNews } from '@/lib/mock-data';
import { isFresh, liveEnvelope, mockEnvelope, staleCacheEnvelope } from '@/lib/response-envelope';

export const dynamic = 'force-dynamic';

let cached:
  | {
      data: Awaited<ReturnType<typeof fetchEveGlobalNews>>;
      ts: number;
    }
  | null = null;

const CACHE_TTL_MS = 3 * 60 * 1000;
const FRESH_MS = 48 * 60 * 60 * 1000;

function serverBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

function shouldTriggerSynthesisPipeline(request: NextRequest): boolean {
  return request.headers.get('x-mobius-skip-synthesis-pipeline') !== '1';
}

function scheduleSynthesisPipelineTrigger(baseUrl: string, request: NextRequest): void {
  if (!shouldTriggerSynthesisPipeline(request)) {
    return;
  }
  try {
    after(() => {
      triggerEveSynthesisPipelineAfterObservation(baseUrl);
    });
  } catch {
    triggerEveSynthesisPipelineAfterObservation(baseUrl);
  }
}

function combineWithInternal(
  external: Pick<EveSynthesis, 'items' | 'pattern_notes' | 'global_tension'>,
  internal: Awaited<ReturnType<typeof buildAndCommitEveInternalSynthesis>>,
): EveSynthesis {
  const byId = new Map<string, EveSynthesis['items'][number]>();

  for (const item of [...internal.items, ...external.items]) {
    byId.set(item.id, item);
  }

  const items = [...byId.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const externalNotes = external.pattern_notes.filter((note) => typeof note === 'string' && note.trim().length > 0);
  const pattern_notes = [...internal.pattern_notes, ...externalNotes].slice(0, 6);

  return {
    timestamp: new Date().toISOString(),
    agent: 'EVE',
    total_items: items.length,
    items,
    pattern_notes,
    dominant_region: internal.dominant_region,
    dominant_category: internal.dominant_category,
    global_tension: internal.global_tension === 'high' ? 'high' : external.global_tension,
  };
}

export async function GET(request: NextRequest) {
  const now = Date.now();
  const internal = await buildAndCommitEveInternalSynthesis();

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    const freshExternalItems = cached.data.items.filter((item) => isFresh(item.timestamp, FRESH_MS));
    const combined = combineWithInternal(
      { ...cached.data, items: freshExternalItems },
      internal,
    );

    scheduleSynthesisPipelineTrigger(serverBaseUrl(request), request);

    return NextResponse.json(
      {
        ok: true,
        ...liveEnvelope(combined.timestamp),
        cached: true,
        ...combined,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
          'X-Mobius-Source': 'eve-global-news-cached',
          'X-Mobius-Agent': 'EVE',
        },
      },
    );
  }

  try {
    const synthesis = await fetchEveGlobalNews();
    const freshExternalItems = synthesis.items.filter((item) => isFresh(item.timestamp, FRESH_MS));

    const freshSynthesis = {
      ...synthesis,
      total_items: freshExternalItems.length,
      items: freshExternalItems,
    };
    cached = { data: freshSynthesis, ts: now };

    const combined = combineWithInternal(freshSynthesis, internal);

    scheduleSynthesisPipelineTrigger(serverBaseUrl(request), request);

    return NextResponse.json(
      { ok: true, ...liveEnvelope(synthesis.timestamp), cached: false, ...combined },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
          'X-Mobius-Source': 'eve-global-news-live',
          'X-Mobius-Agent': 'EVE',
        },
      },
    );
  } catch (error) {
    if (cached) {
      const combined = combineWithInternal(cached.data, internal);
      return NextResponse.json(
        {
          ok: true,
          ...staleCacheEnvelope(combined.timestamp, 'EVE external feed unavailable; internal synthesis active'),
          cached: true,
          ...combined,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
            'X-Mobius-Source': 'eve-global-news-stale-cache',
            'X-Mobius-Agent': 'EVE',
          },
        },
      );
    }

    const mock = {
      timestamp: new Date().toISOString(),
      agent: 'EVE' as const,
      total_items: mockEveNews().length,
      items: mockEveNews(),
      pattern_notes: ['No external live items available - EVE fallback engaged'],
      dominant_region: 'Global',
      dominant_category: 'geopolitical' as const,
      global_tension: 'low' as const,
    };

    const combined = combineWithInternal(mock, internal);

    console.error('EVE global-news fetch failed', error);
    return NextResponse.json(
      {
        ok: true,
        ...mockEnvelope('EVE external feed unavailable; internal synthesis active'),
        cached: false,
        ...combined,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
          'X-Mobius-Source': 'eve-global-news-internal-fallback',
          'X-Mobius-Agent': 'EVE',
        },
      },
    );
  }
}
