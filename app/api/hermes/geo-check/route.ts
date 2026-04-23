import { NextRequest, NextResponse } from 'next/server';
import { callClaudeJson } from '@/lib/integrity/claude';
import type { GeoLayer, SeoLayer } from '@/lib/integrity-signal';

export const dynamic = 'force-dynamic';

type HermesGeoResponse = {
  ai_consensus: 'aligned' | 'divergent' | 'conflicting';
  citation_count: number;
  semantic_drift: number;
  drift_explanation: string;
  circular_reporting_risk: boolean;
  hermes_routing_note: string;
};

const SYSTEM_PROMPT = `You are HERMES, the Routing and Prioritization agent of the Mobius Civic AI Terminal. Your new capability is Generative Engine Optimization (GEO) assessment — evaluating how AI language models are currently contextualizing civic claims, and detecting semantic drift from the authoritative source.
Respond ONLY with valid JSON matching this exact shape:
{
  "ai_consensus": "aligned|divergent|conflicting",
  "citation_count": 0,
  "semantic_drift": 0.0,
  "drift_explanation": "One sentence explaining what drifted if drift > 0.3",
  "circular_reporting_risk": false,
  "hermes_routing_note": "One sentence HERMES routing recommendation"
}
"circular_reporting_risk" = true if AI models appear to cite each other without a verifiable primary source (ai_consensus=aligned but primary_source_found=false in SEO context).`;

function parseGeoResponse(value: unknown): HermesGeoResponse | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  const aiConsensus = obj.ai_consensus;
  const citationCount = obj.citation_count;
  const semanticDrift = obj.semantic_drift;
  const driftExplanation = obj.drift_explanation;
  const circularRisk = obj.circular_reporting_risk;
  const routingNote = obj.hermes_routing_note;

  if (aiConsensus !== 'aligned' && aiConsensus !== 'divergent' && aiConsensus !== 'conflicting') return null;
  if (typeof citationCount !== 'number') return null;
  if (typeof semanticDrift !== 'number') return null;
  if (typeof driftExplanation !== 'string') return null;
  if (typeof circularRisk !== 'boolean') return null;
  if (typeof routingNote !== 'string' || !routingNote.trim()) return null;

  return {
    ai_consensus: aiConsensus,
    citation_count: Math.max(0, Math.min(50, Math.round(citationCount))),
    semantic_drift: Math.min(Math.max(semanticDrift, 0), 1),
    drift_explanation: driftExplanation.trim(),
    circular_reporting_risk: circularRisk,
    hermes_routing_note: routingNote.trim(),
  };
}

export async function GET() {
  return NextResponse.json({ ok: true, info: 'POST { claim, source_node } for GEO layer check' });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch((): unknown => null)) as
    | { claim?: unknown; source_node?: unknown; seo_context?: unknown }
    | null;

  const claim = typeof payload?.claim === 'string' ? payload.claim.trim() : '';
  const sourceNode = typeof payload?.source_node === 'string' ? payload.source_node.trim() : '';
  const seoContext = payload?.seo_context as SeoLayer | undefined;

  if (!claim || !sourceNode) {
    return NextResponse.json({ ok: false, error: 'claim and source_node are required' }, { status: 400 });
  }

  const seoContextSummary = seoContext
    ? `SEO context => authority_score=${seoContext.authority_score}, primary_source_found=${seoContext.primary_source_found}, top_domains=${seoContext.top_domains.join(',')}`
    : 'SEO context unavailable';

  try {
    const userPrompt = `Claim: ${claim}\nSource: ${sourceNode}\n${seoContextSummary}`;
    const claude = await callClaudeJson(SYSTEM_PROMPT, userPrompt);

    if (!claude.ok) {
      console.error('hermes/geo-check Claude call failed', claude.error);
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

    const validated = parseGeoResponse(parsed);
    if (!validated) {
      return NextResponse.json(
        { ok: false, error: 'Claude response failed schema validation', raw: claude.jsonText },
        { status: 502 },
      );
    }

    const forcedCircularRisk = seoContext?.primary_source_found === false && validated.ai_consensus === 'aligned';
    const circularReportingRisk = forcedCircularRisk ? true : validated.circular_reporting_risk;

    const geoLayer: GeoLayer = {
      ai_consensus: validated.ai_consensus,
      citation_count: validated.citation_count,
      semantic_drift: validated.semantic_drift,
    };

    return NextResponse.json({
      ok: true,
      agent: 'HERMES',
      geo_layer: geoLayer,
      circular_reporting_risk: circularReportingRisk,
      drift_explanation: validated.drift_explanation,
      hermes_routing_note: validated.hermes_routing_note,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('hermes/geo-check failed', error);
    return NextResponse.json({ ok: false, error: 'GEO assessment failed' }, { status: 500 });
  }
}
