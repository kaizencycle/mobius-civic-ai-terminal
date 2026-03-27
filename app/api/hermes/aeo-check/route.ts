import { NextRequest, NextResponse } from 'next/server';
import { callClaudeJson } from '@/lib/integrity/claude';
import type { AeoLayer, GeoLayer } from '@/lib/integrity-signal';

export const dynamic = 'force-dynamic';

type HermesAeoResponse = {
  snippet_match: boolean;
  direct_answer: string;
  contradiction_detected: boolean;
  contradiction_detail: string | null;
  confidence: number;
};

type TripwireGetResponse = {
  tripwire?: {
    active?: boolean;
    level?: string;
  };
};

const SYSTEM_PROMPT = `You are HERMES, AEO (Answer Engine Optimization) layer. Your role is to assess whether a civic claim would be accurately represented as a direct answer in AI-powered search (Perplexity, ChatGPT, Gemini, etc.) and detect any contradictions between the claimed fact and likely direct answers.
Respond ONLY with valid JSON matching this exact shape:
{
  "snippet_match": true,
  "direct_answer": "The direct answer an AI engine would give to this claim",
  "contradiction_detected": false,
  "contradiction_detail": null,
  "confidence": 0.0
}
"contradiction_detected" = true if the direct_answer substantively contradicts the original claim text.`;

function serverBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

function parseAeoResponse(value: unknown): HermesAeoResponse | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  const snippetMatch = obj.snippet_match;
  const directAnswer = obj.direct_answer;
  const contradictionDetected = obj.contradiction_detected;
  const contradictionDetail = obj.contradiction_detail;
  const confidence = obj.confidence;

  if (typeof snippetMatch !== 'boolean') return null;
  if (typeof directAnswer !== 'string' || !directAnswer.trim()) return null;
  if (typeof contradictionDetected !== 'boolean') return null;
  if (!(typeof contradictionDetail === 'string' || contradictionDetail === null)) return null;
  if (typeof confidence !== 'number') return null;

  return {
    snippet_match: snippetMatch,
    direct_answer: directAnswer.trim(),
    contradiction_detected: contradictionDetected,
    contradiction_detail: contradictionDetail,
    confidence: Math.min(Math.max(confidence, 0), 1),
  };
}

async function maybeTriggerTripwire(
  request: NextRequest,
  claim: string,
): Promise<boolean> {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret || !secret.trim()) return false;

  const base = serverBaseUrl(request);

  try {
    const statusRes = await fetch(`${base}/api/tripwire/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    const statusJson = (await statusRes.json().catch((): unknown => null)) as TripwireGetResponse | null;
    const level = statusJson?.tripwire?.level;
    const alreadyTriggered = level === 'high' || level === 'triggered';
    const suspended = level === 'suspended';
    if (alreadyTriggered || suspended) return false;

    const reason = `HERMES AEO: contradiction detected in ${claim.slice(0, 120)}`;

    const triggerRes = await fetch(`${base}/api/tripwire/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        triggered: true,
        reason,
        agent: 'HERMES',
        severity: 'high',
      }),
      cache: 'no-store',
    });

    return triggerRes.ok;
  } catch (error) {
    console.error('hermes/aeo-check tripwire trigger failed', error);
    return false;
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, info: 'POST { claim, source_node } for AEO layer check' });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch((): unknown => null)) as
    | { claim?: unknown; source_node?: unknown; geo_context?: unknown }
    | null;

  const claim = typeof payload?.claim === 'string' ? payload.claim.trim() : '';
  const sourceNode = typeof payload?.source_node === 'string' ? payload.source_node.trim() : '';
  const geoContext = payload?.geo_context as GeoLayer | undefined;

  if (!claim || !sourceNode) {
    return NextResponse.json({ ok: false, error: 'claim and source_node are required' }, { status: 400 });
  }

  const geoContextSummary = geoContext
    ? `GEO context => ai_consensus=${geoContext.ai_consensus}, citation_count=${geoContext.citation_count}, semantic_drift=${geoContext.semantic_drift}`
    : 'GEO context unavailable';

  try {
    const userPrompt = `Check AEO accuracy: Claim: ${claim}. Source: ${sourceNode}. GEO context: ${geoContextSummary}`;

    const claude = await callClaudeJson(SYSTEM_PROMPT, userPrompt);
    if (!claude.ok) {
      console.error('hermes/aeo-check Claude call failed', claude.error);
      return NextResponse.json({ ok: false, error: claude.error, httpStatus: claude.httpStatus }, { status: 503 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(claude.jsonText) as unknown;
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Claude returned malformed JSON', raw: claude.jsonText },
        { status: 502 },
      );
    }

    const validated = parseAeoResponse(parsed);
    if (!validated) {
      return NextResponse.json(
        { ok: false, error: 'Claude response failed schema validation', raw: claude.jsonText },
        { status: 502 },
      );
    }

    const aeoLayer: AeoLayer = {
      snippet_match: validated.snippet_match,
      direct_answer: validated.direct_answer,
      contradiction_detected: validated.contradiction_detected,
    };

    const tripwireTriggered = validated.contradiction_detected
      ? await maybeTriggerTripwire(request, claim)
      : false;

    return NextResponse.json({
      ok: true,
      agent: 'HERMES',
      aeo_layer: aeoLayer,
      contradiction_detail: validated.contradiction_detail,
      confidence: validated.confidence,
      tripwire_triggered: tripwireTriggered,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('hermes/aeo-check failed', error);
    return NextResponse.json({ ok: false, error: 'AEO assessment failed' }, { status: 500 });
  }
}
