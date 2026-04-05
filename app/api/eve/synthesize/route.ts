/**
 * POST /api/eve/synthesize — Claude synthesis over fresh EVE items
 * GET  — usage info
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { EveNewsItem, EveSynthesis } from '@/lib/eve/global-news';
import { callClaudeForEveSynthesis } from '@/lib/eve/synthesize-claude';
import { isFresh } from '@/lib/response-envelope';

export const dynamic = 'force-dynamic';

const FRESH_MS = 48 * 60 * 60 * 1000;

function serverBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

async function resolveCycleIdFromEngine(base: string): Promise<string | null> {
  const res = await fetch(`${base}/api/eve/cycle-advance`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data: unknown = await res.json();
  if (data === null || typeof data !== 'object') return null;
  const c = (data as { currentCycle?: unknown }).currentCycle;
  return typeof c === 'string' && c.trim() ? c.trim() : null;
}

type SynthesizeBody = {
  items?: EveNewsItem[];
  cycleId?: string;
};

type SynthesisTheme = 'geopolitical' | 'market' | 'infrastructure' | 'governance' | 'narrative';

function mapThoughtTheme(value: string): SynthesisTheme | null {
  if (value === 'geopolitical') return 'geopolitical';
  if (value === 'market') return 'market';
  if (value === 'infrastructure') return 'infrastructure';
  if (value === 'governance') return 'governance';
  if (value === 'narrative') return 'narrative';
  return null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST to synthesize current EVE signal set',
  });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json(
      { ok: false, error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 503 },
    );
  }

  let body: SynthesizeBody = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as SynthesizeBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  let items: EveNewsItem[] = Array.isArray(body.items) ? body.items : [];
  let cycleId = typeof body.cycleId === 'string' && body.cycleId.trim() ? body.cycleId.trim() : '';
  let pattern_notes: string[] = [];
  let global_tension: EveSynthesis['global_tension'] = 'low';

  const base = serverBaseUrl(request);

  if (items.length === 0) {
    const res = await fetch(`${base}/api/eve/global-news`, {
      headers: {
        Accept: 'application/json',
        'X-Mobius-Skip-Synthesis-Pipeline': '1',
      },
      cache: 'no-store',
    });
    const eveData = (await res.json()) as Partial<EveSynthesis> & { items?: EveNewsItem[] };
    items = Array.isArray(eveData.items) ? eveData.items : [];
    pattern_notes = Array.isArray(eveData.pattern_notes) ? eveData.pattern_notes : [];
    global_tension = eveData.global_tension ?? 'low';
  } else {
    pattern_notes = ['Provided inline with request'];
    global_tension = 'moderate';
  }

  if (!cycleId) {
    const fromEngine = await resolveCycleIdFromEngine(base);
    cycleId = fromEngine ?? 'unknown';
  }

  const freshItems = items.filter((item) => isFresh(item.timestamp, FRESH_MS));
  if (freshItems.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No fresh EVE items (within 48h) to synthesize', itemCount: 0 },
      { status: 400 },
    );
  }

  const result = await callClaudeForEveSynthesis(apiKey, cycleId, freshItems, {
    pattern_notes,
    global_tension,
  });

  if (!result.ok) {
    if (result.error === 'Claude returned malformed JSON' && result.raw !== undefined) {
      return NextResponse.json({
        ok: false,
        error: result.error,
        raw: result.raw,
      });
    }
    if (result.responseBody !== undefined) {
      console.error('EVE synthesize Claude failure', result.error, result.httpStatus ?? '', result.responseBody);
      return NextResponse.json({
        ok: false,
        error: result.error,
        httpStatus: result.httpStatus,
        responseBody: result.responseBody,
      });
    }
    console.error('EVE synthesize failure', result.error);
    return NextResponse.json({ ok: false, error: result.error, raw: result.raw }, { status: 502 });
  }

  const renderThoughtBrokerUrl = process.env.RENDER_THOUGHT_BROKER_URL;
  let degraded = false;
  let routingMetadata: Record<string, unknown> | null = null;
  let dominantTheme = result.parsed.dominantTheme;

  if (renderThoughtBrokerUrl) {
    try {
      const routeResponse = await fetch(`${renderThoughtBrokerUrl}/classify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          title: result.parsed.epiconTitle,
          category: result.parsed.patternType,
          severity: result.parsed.severity,
          source: 'eve-synthesis',
        }),
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });

      if (routeResponse.ok) {
        const routeData = (await routeResponse.json()) as Record<string, unknown>;
        routingMetadata = routeData;
        const candidateTheme =
          (typeof routeData.dominantTheme === 'string' && routeData.dominantTheme) ||
          (typeof routeData.theme === 'string' && routeData.theme) ||
          (typeof routeData.category === 'string' && routeData.category) ||
          '';
        const mappedTheme = mapThoughtTheme(candidateTheme);
        if (mappedTheme) {
          dominantTheme = mappedTheme;
        }
      } else {
        degraded = true;
        console.error(`[render:thought-broker] ${routeResponse.status} ${routeResponse.statusText}`);
      }
    } catch (error) {
      degraded = true;
      console.error('[render:thought-broker] request failed', error);
    }
  }

  return NextResponse.json({
    ok: true,
    agent: 'EVE',
    cycleId,
    timestamp: new Date().toISOString(),
    itemCount: freshItems.length,
    degraded,
    routingMetadata,
    synthesis: {
      ...result.parsed,
      dominantTheme,
    },
    source: 'claude-synthesis',
  });
}
