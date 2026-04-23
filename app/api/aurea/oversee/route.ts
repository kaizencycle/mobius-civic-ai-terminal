import { NextResponse } from 'next/server';
import { buildAureaOversightReport } from '@/lib/aurea/oversee';
import { appendAgentJournalEntry } from '@/lib/agents/journal';
import { currentCycleId } from '@/lib/eve/cycle-engine';

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

  void appendAgentJournalEntry({
    agent: 'AUREA',
    cycle: currentCycleId(),
    observation: `AUREA oversight ran across ${report.adapter_health.total} sources with ${report.adapter_health.degraded} degraded lanes.`,
    inference: `Candidate backlog is ${report.pending_epicon_backlog.status} with ${report.pending_epicon_backlog.count} pending items.`,
    recommendation: report.pending_epicon_backlog.status === 'nominal'
      ? 'Maintain current operating posture and continue routine close checks.'
      : 'Review degraded adapter lanes and prioritize verification queue before daily close.',
    confidence: report.pending_epicon_backlog.status === 'nominal' ? 0.88 : 0.76,
    derivedFrom: ['aurea:oversight', 'adapter-health', 'source-reliability'],
    relatedAgents: ['ATLAS', 'ZEUS', 'ECHO'],
    status: 'committed',
    category: 'close',
    severity: report.pending_epicon_backlog.status === 'nominal' ? 'nominal' : 'elevated',
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    report,
  });
}
