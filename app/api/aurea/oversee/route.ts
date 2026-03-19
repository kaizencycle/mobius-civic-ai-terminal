import { NextResponse } from 'next/server';
import { buildAureaOversightReport } from '@/lib/aurea/oversee';

export const dynamic = 'force-dynamic';

export async function GET() {
  const report = buildAureaOversightReport({
    adapterHealth: [
      {
        source_system: 'bots_of_wall_street',
        status: 'healthy',
        last_ingest_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        error_rate: 0.04,
      },
      {
        source_system: 'moltbook',
        status: 'degraded',
        last_ingest_at: new Date().toISOString(),
        last_success_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        error_rate: 0.27,
      },
      {
        source_system: 'openclaw',
        status: 'healthy',
        last_ingest_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        error_rate: 0.03,
      },
    ],
    candidates: [
      {
        external_source_system: 'bots_of_wall_street',
        confidence_tier: 0,
        status: 'pending',
      },
      {
        external_source_system: 'moltbook',
        confidence_tier: 0,
        status: 'pending',
      },
      {
        external_source_system: 'openclaw',
        confidence_tier: 1,
        status: 'pending',
      },
    ],
    reliability: [
      {
        source_system: 'bots_of_wall_street',
        reliability_score: 0.42,
        previous_reliability_score: 0.48,
        verified_hits: 12,
        verified_misses: 17,
      },
      {
        source_system: 'moltbook',
        reliability_score: 0.51,
        previous_reliability_score: 0.54,
        verified_hits: 8,
        verified_misses: 7,
      },
      {
        source_system: 'openclaw',
        reliability_score: 0.63,
        previous_reliability_score: 0.61,
        verified_hits: 10,
        verified_misses: 4,
      },
    ],
  });

  return NextResponse.json({
    ok: true,
    report,
  });
}
