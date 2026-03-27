import { NextRequest, NextResponse } from 'next/server';
import { isFresh } from '@/lib/response-envelope';
import type { EveNewsItem } from '@/lib/eve/global-news';
import type { EveSynthesisPayload } from '@/lib/eve/synthesis-pipeline-store';

export const dynamic = 'force-dynamic';

type SynthesizeBody = {
  items?: EveNewsItem[];
  cycleId?: string;
};

type EveGlobalNewsResponse = {
  items: EveNewsItem[];
  pattern_notes?: string[];
  global_tension?: string;
};

type ClaudeResponse = {
  content?: Array<{
    type: string;
    text?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

const VALID_THEMES = ['geopolitical', 'market', 'infrastructure', 'governance', 'narrative'] as const;
const VALID_PATTERN_TYPES = ['escalation', 'de-escalation', 'volatility', 'stability', 'convergence', 'divergence'] as const;
const VALID_SEVERITY = ['low', 'medium', 'high'] as const;

function isConfidenceTier(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isSynthesisPayload(value: unknown): value is EveSynthesisPayload {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.synthesis === 'string' &&
    typeof candidate.dominantRegion === 'string' &&
    typeof candidate.epiconTitle === 'string' &&
    typeof candidate.epiconSummary === 'string' &&
    VALID_THEMES.includes(candidate.dominantTheme as (typeof VALID_THEMES)[number]) &&
    VALID_PATTERN_TYPES.includes(candidate.patternType as (typeof VALID_PATTERN_TYPES)[number]) &&
    VALID_SEVERITY.includes(candidate.severity as (typeof VALID_SEVERITY)[number]) &&
    isConfidenceTier(candidate.confidenceTier) &&
    Array.isArray(candidate.flags) &&
    candidate.flags.every((flag) => typeof flag === 'string')
  );
}

function buildSystemPrompt(): string {
  return `You are EVE, the constitutional observer of the Mobius Civic AI Terminal.
Your role is to synthesize raw signal observations into a single structured EPICON ledger entry that captures the dominant pattern, threat vector, or civic significance of the current signal set.
You must respond with a JSON object only — no markdown, no preamble.
The JSON must match this exact shape:
{
"synthesis": "2-3 sentence synthesis narrative in EVE’s voice",
"dominantTheme": "one of: geopolitical|market|infrastructure|governance|narrative",
"dominantRegion": "primary geographic region or 'Global'",
"patternType": "one of: escalation|de-escalation|volatility|stability|convergence|divergence",
"confidenceTier": 1, 2, or 3,
"epiconTitle": "Short EPICON entry title (max 80 chars)",
"epiconSummary": "One sentence for the ledger entry body",
"flags": [] or array of strings for any manipulation/bias concerns,
"severity": "low|medium|high"
}`;
}

function buildUserPrompt(input: {
  cycleId: string;
  items: EveNewsItem[];
  patternNotes: string[];
  globalTension: string;
}): string {
  const itemLines = input.items
    .map((item, idx) => `${idx + 1}. ${item.title} | category=${item.category} | region=${item.region} | eve_tag=${item.eve_tag}`)
    .join('\n');

  const notes = input.patternNotes.length > 0 ? input.patternNotes.join(' | ') : 'none';

  return `Current signal set for cycle ${input.cycleId}:
${itemLines}

Existing pattern observations: ${notes}
Global tension level: ${input.globalTension}
Synthesize these into a single EPICON entry.`;
}

async function fetchGlobalNews(request: NextRequest): Promise<EveGlobalNewsResponse> {
  const base = request.nextUrl.origin;
  const response = await fetch(`${base}/api/eve/global-news`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Unable to load /api/eve/global-news (${response.status})`);
  }

  return (await response.json()) as EveGlobalNewsResponse;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST to synthesize current EVE signal set',
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: 'ANTHROPIC_API_KEY is not configured',
      },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as SynthesizeBody;
    const fallbackCycleId = `C-${new Date().getUTCDate().toString().padStart(3, '0')}`;
    const cycleId = body.cycleId ?? fallbackCycleId;

    const eveData = body.items
      ? { items: body.items, pattern_notes: [], global_tension: 'unknown' }
      : await fetchGlobalNews(request);

    const freshItems = eveData.items.filter((item) => isFresh(item.timestamp, 48 * 60 * 60 * 1000));

    if (freshItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No fresh EVE items within 48h window',
        },
        { status: 400 }
      );
    }

    const system = buildSystemPrompt();
    const user = buildUserPrompt({
      cycleId,
      items: freshItems,
      patternNotes: eveData.pattern_notes ?? [],
      globalTension: eveData.global_tension ?? 'unknown',
    });

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    const data = (await anthropicResponse.json()) as ClaudeResponse;

    if (!anthropicResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Claude API error',
          raw: data,
        },
        { status: 502 }
      );
    }

    const rawText = data.content?.find((entry) => entry.type === 'text')?.text ?? '';

    let parsedUnknown: unknown;
    try {
      parsedUnknown = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'Claude returned malformed JSON',
          raw: rawText,
        },
        { status: 502 }
      );
    }

    if (!isSynthesisPayload(parsedUnknown)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Claude response failed schema validation',
          raw: parsedUnknown,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      agent: 'EVE',
      cycleId,
      timestamp: new Date().toISOString(),
      itemCount: freshItems.length,
      synthesis: parsedUnknown,
      source: 'claude-synthesis',
    });
  } catch (error) {
    console.error('EVE synthesis failed', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Synthesis failed',
      },
      { status: 500 }
    );
  }
}
