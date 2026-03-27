import { NextRequest, NextResponse } from 'next/server';
import {
  computeIntegrityScore,
  determineTripwire,
  type AeoLayer,
  type GeoLayer,
  type MobiusCivicIntegritySignal,
  type SeoLayer,
} from '@/lib/integrity-signal';
import { setLatestIntegritySignal } from '@/lib/integrity/signal-store';

export const dynamic = 'force-dynamic';

type VerifyClaimResponse = {
  ok: boolean;
  seo_layer?: SeoLayer;
  jade_annotation?: string;
  schema_type?: string;
  error?: string;
};

type GeoCheckResponse = {
  ok: boolean;
  geo_layer?: GeoLayer;
  circular_reporting_risk?: boolean;
  hermes_routing_note?: string;
  drift_explanation?: string;
  error?: string;
};

type AeoCheckResponse = {
  ok: boolean;
  aeo_layer?: AeoLayer;
  contradiction_detail?: string | null;
  tripwire_triggered?: boolean;
  error?: string;
};

function serverBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function truncateClaim(claim: string, max = 60): string {
  if (claim.length <= max) return claim;
  return `${claim.slice(0, max - 1)}…`;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST { claim, source_node } for full SEO/GEO/AEO integrity signal',
    schema: 'MobiusCivicIntegritySignal',
    scoring: {
      seo_weight: '40%',
      geo_weight: '35%',
      aeo_weight: '25%',
      tripwire_triggers: [
        'contradiction_detected === true',
        "ai_consensus === 'conflicting'",
        'semantic_drift > 0.7',
        "ai_consensus === 'divergent' AND !primary_source_found",
      ],
    },
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret || !secret.trim()) {
    return NextResponse.json({ ok: false, error: 'BACKFILL_SECRET is not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const payload = (await request.json().catch((): unknown => null)) as
    | { claim?: unknown; source_node?: unknown; cycleId?: unknown }
    | null;

  const claim = typeof payload?.claim === 'string' ? payload.claim.trim() : '';
  const sourceNode = typeof payload?.source_node === 'string' ? payload.source_node.trim() : '';

  if (!claim || !sourceNode) {
    return NextResponse.json({ ok: false, error: 'claim and source_node are required' }, { status: 400 });
  }

  const base = serverBaseUrl(request);
  let cycleId = typeof payload?.cycleId === 'string' ? payload.cycleId.trim() : '';

  if (!cycleId) {
    try {
      const cycleRes = await fetch(`${base}/api/eve/cycle-advance`, { cache: 'no-store' });
      const cycleJson = await readJson<{ currentCycle?: string }>(cycleRes);
      cycleId = typeof cycleJson?.currentCycle === 'string' ? cycleJson.currentCycle : 'C-0';
    } catch {
      cycleId = 'C-0';
    }
  }

  try {
    const seoRes = await fetch(`${base}/api/jade/verify-claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ claim, source_node: sourceNode, cycleId }),
      cache: 'no-store',
    });
    const seoJson = await readJson<VerifyClaimResponse>(seoRes);

    if (!seoRes.ok || !seoJson?.ok || !seoJson.seo_layer) {
      return NextResponse.json(
        {
          ok: false,
          error: seoJson?.error ?? 'SEO verification failed',
          step: 'seo',
        },
        { status: seoRes.ok ? 502 : seoRes.status },
      );
    }

    const seoLayer = seoJson.seo_layer;

    const [geoRes, aeoRes] = await Promise.all([
      fetch(`${base}/api/hermes/geo-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ claim, source_node: sourceNode, seo_context: seoLayer }),
        cache: 'no-store',
      }),
      fetch(`${base}/api/hermes/aeo-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ claim, source_node: sourceNode }),
        cache: 'no-store',
      }),
    ]);

    const geoJson = await readJson<GeoCheckResponse>(geoRes);
    if (!geoRes.ok || !geoJson?.ok || !geoJson.geo_layer) {
      return NextResponse.json(
        {
          ok: false,
          error: geoJson?.error ?? 'GEO check failed',
          step: 'geo',
        },
        { status: geoRes.ok ? 502 : geoRes.status },
      );
    }

    const geoLayer = geoJson.geo_layer;

    const aeoJson = await readJson<AeoCheckResponse>(aeoRes);
    if (!aeoRes.ok || !aeoJson?.ok || !aeoJson.aeo_layer) {
      return NextResponse.json(
        {
          ok: false,
          error: aeoJson?.error ?? 'AEO check failed',
          step: 'aeo',
        },
        { status: aeoRes.ok ? 502 : aeoRes.status },
      );
    }

    const aeoLayer = aeoJson.aeo_layer;
    const layers = { seo_layer: seoLayer, geo_layer: geoLayer, aeo_layer: aeoLayer };
    const integrityScore = computeIntegrityScore(layers);
    const tripwireStatus = determineTripwire(layers);

    const signal: MobiusCivicIntegritySignal = {
      signal_id: `sig-${Date.now().toString(36)}-jade`,
      timestamp: new Date().toISOString(),
      claim: { text: claim, source_node: sourceNode },
      integrity_score: integrityScore,
      layers,
      tripwire_status: tripwireStatus,
      agent_origin: 'JADE',
      cycle: cycleId,
    };

    setLatestIntegritySignal(signal);

    let epiconFlagged = false;
    if (integrityScore <= 0.5) {
      const confidenceTier = integrityScore >= 0.7 ? 2 : integrityScore >= 0.5 ? 1 : 3;

      const epiconRes = await fetch(`${base}/api/epicon/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          title: `Integrity Alert: Low-confidence claim — ${truncateClaim(claim, 60)}`,
          summary: `Integrity score ${integrityScore}. Tripwire: ${tripwireStatus}. SEO authority: ${seoLayer.authority_score}. GEO consensus: ${geoLayer.ai_consensus}. Contradiction: ${aeoLayer.contradiction_detected}`,
          dominantTheme: 'governance',
          confidenceTier,
          severity: integrityScore < 0.5 ? 'high' : 'medium',
          source: 'jade-integrity-signal',
          patternType: aeoLayer.contradiction_detected ? 'divergence' : 'volatility',
        }),
        cache: 'no-store',
      });

      epiconFlagged = epiconRes.ok;
    }

    return NextResponse.json({
      ok: true,
      signal,
      epicon_flagged: epiconFlagged,
      layers_detail: {
        jade_annotation: seoJson.jade_annotation ?? '',
        circular_reporting_risk: geoJson.circular_reporting_risk ?? false,
        contradiction_detail: aeoJson.contradiction_detail ?? null,
        hermes_routing_note: geoJson.hermes_routing_note ?? '',
      },
    });
  } catch (error) {
    console.error('jade/integrity-signal failed', error);
    return NextResponse.json({ ok: false, error: 'Integrity signal pipeline failed' }, { status: 500 });
  }
}
