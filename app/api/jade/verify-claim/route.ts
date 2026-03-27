import { NextRequest, NextResponse } from 'next/server';
import { callClaudeJson } from '@/lib/integrity/claude';
import type { SeoLayer } from '@/lib/integrity-signal';

export const dynamic = 'force-dynamic';

type JadeAuthorityResponse = {
  top_domains: string[];
  authority_score: number;
  primary_source_found: boolean;
  schema_type: 'GovernmentOrganization' | 'NewsArticle' | 'Event' | 'Person' | 'Dataset' | 'Other';
  jade_annotation: string;
};

const SYSTEM_PROMPT = `You are JADE, the Annotation and Memory Framing agent of the Mobius Civic AI Terminal. Your new capability is SEO Authority Assessment — evaluating the discoverability and source credibility of civic claims.
Given a civic claim, assess it as a search authority would.
Respond ONLY with valid JSON, no markdown, matching this exact shape:
{
  "top_domains": ["domain1.com", "domain2.gov"],
  "authority_score": 0.0,
  "primary_source_found": true,
  "schema_type": "GovernmentOrganization|NewsArticle|Event|Person|Dataset|Other",
  "jade_annotation": "One sentence JADE framing of this claim’s authority context"
}`;

const VALID_SCHEMA_TYPES = new Set([
  'GovernmentOrganization',
  'NewsArticle',
  'Event',
  'Person',
  'Dataset',
  'Other',
]);

function validateResponse(value: unknown): JadeAuthorityResponse | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  const topDomains = obj.top_domains;
  const authorityScore = obj.authority_score;
  const primarySourceFound = obj.primary_source_found;
  const schemaType = obj.schema_type;
  const jadeAnnotation = obj.jade_annotation;

  if (!Array.isArray(topDomains) || !topDomains.every((d): d is string => typeof d === 'string')) return null;
  if (typeof authorityScore !== 'number') return null;
  if (typeof primarySourceFound !== 'boolean') return null;
  if (typeof schemaType !== 'string' || !VALID_SCHEMA_TYPES.has(schemaType)) return null;
  if (typeof jadeAnnotation !== 'string' || !jadeAnnotation.trim()) return null;

  return {
    top_domains: topDomains.slice(0, 5),
    authority_score: Math.min(Math.max(authorityScore, 0), 1),
    primary_source_found: primarySourceFound,
    schema_type: schemaType as JadeAuthorityResponse['schema_type'],
    jade_annotation: jadeAnnotation.trim(),
  };
}

export async function GET() {
  return NextResponse.json({ ok: true, info: 'POST { claim, source_node } to assess SEO authority' });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch((): unknown => null)) as
    | { claim?: unknown; source_node?: unknown; cycleId?: unknown }
    | null;

  const claim = typeof payload?.claim === 'string' ? payload.claim.trim() : '';
  const sourceNode = typeof payload?.source_node === 'string' ? payload.source_node.trim() : '';
  const cycleId = typeof payload?.cycleId === 'string' ? payload.cycleId.trim() : undefined;

  if (!claim || !sourceNode) {
    return NextResponse.json({ ok: false, error: 'claim and source_node are required' }, { status: 400 });
  }

  try {
    const userPrompt = `Assess the SEO authority of this civic claim: ${claim}. Source: ${sourceNode}`;
    const claude = await callClaudeJson(SYSTEM_PROMPT, userPrompt);

    if (!claude.ok) {
      console.error('jade/verify-claim Claude call failed', claude.error);
      return NextResponse.json(
        {
          ok: false,
          error: claude.error,
          httpStatus: claude.httpStatus,
        },
        { status: 503 },
      );
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

    const validated = validateResponse(parsed);
    if (!validated) {
      return NextResponse.json(
        { ok: false, error: 'Claude response failed schema validation', raw: claude.jsonText },
        { status: 502 },
      );
    }

    const seoLayer: SeoLayer = {
      top_domains: validated.top_domains,
      authority_score: validated.authority_score,
      primary_source_found: validated.primary_source_found,
    };

    return NextResponse.json({
      ok: true,
      agent: 'JADE',
      claim: { text: claim, source_node: sourceNode },
      seo_layer: seoLayer,
      jade_annotation: validated.jade_annotation,
      schema_type: validated.schema_type,
      timestamp: new Date().toISOString(),
      cycleId,
    });
  } catch (error) {
    console.error('jade/verify-claim failed', error);
    return NextResponse.json({ ok: false, error: 'SEO authority assessment failed' }, { status: 500 });
  }
}
