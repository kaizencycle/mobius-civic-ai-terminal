import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ShadowQuorumRow = {
  agent: string;
  present: boolean;
  confidence: number;
  passed: boolean;
  action: string;
  route: string;
};

type ShadowQuorumPayload = {
  ok?: boolean;
  shadow_mode?: boolean;
  quorum?: {
    required_agents?: string[];
    threshold?: number;
    present?: number;
    passed?: number;
    quorum_met_shadow?: boolean;
    rows?: ShadowQuorumRow[];
  };
  readiness?: {
    status?: string;
    score?: number | null;
    p0_failures?: string[];
  };
};

async function getShadow(request: NextRequest): Promise<ShadowQuorumPayload | null> {
  try {
    const response = await fetch(new URL('/api/system/quorum-shadow', request.nextUrl.origin), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as ShadowQuorumPayload;
  } catch {
    return null;
  }
}

function scoreRow(row: ShadowQuorumRow) {
  const missingPenalty = row.present ? 0 : 0.25;
  const confidencePenalty = Math.max(0, 0.85 - row.confidence);
  const routePenalty = row.route === 'cloud+zeus' || row.route === 'cloud' ? 0 : 0.08;
  const score = Math.max(0, Math.min(1, row.confidence - missingPenalty - confidencePenalty - routePenalty));
  return Number(score.toFixed(3));
}

export async function GET(request: NextRequest) {
  const shadow = await getShadow(request);
  const rows: ShadowQuorumRow[] = shadow?.quorum?.rows ?? [];
  const required = shadow?.quorum?.required_agents ?? ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'];
  const timeoutWindowSeconds = 45;

  const scoredRows = rows.map((row) => ({
    ...row,
    integrity_score: scoreRow(row),
    penalties: {
      missing: row.present ? 0 : 0.25,
      low_confidence: Number(Math.max(0, 0.85 - row.confidence).toFixed(3)),
      route_not_verified: row.route === 'cloud+zeus' || row.route === 'cloud' ? 0 : 0.08,
    },
  }));

  const missingAgents = required.filter((agent) => !rows.some((row) => row.agent === agent && row.present));
  const passed = scoredRows.filter((row) => row.integrity_score >= 0.85).length;
  const averageIntegrity = scoredRows.length > 0
    ? Number((scoredRows.reduce((sum, row) => sum + row.integrity_score, 0) / scoredRows.length).toFixed(3))
    : 0;
  const partialConsensusScore = Number(((passed / Math.max(1, required.length)) * averageIntegrity).toFixed(3));
  const degraded = missingAgents.length > 0 || partialConsensusScore < 0.75;

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      phase: 'C-298.phase15.quorum-integrity-rules',
      authoritative: false,
      timeout: {
        window_seconds: timeoutWindowSeconds,
        behavior: 'missing agents are penalized, not silently ignored',
      },
      quorum_integrity: {
        required_agents: required,
        missing_agents: missingAgents,
        passed_agents: passed,
        average_integrity: averageIntegrity,
        partial_consensus_score: partialConsensusScore,
        degraded,
        state: degraded ? 'degraded_shadow_consensus' : shadow?.quorum?.quorum_met_shadow ? 'clean_shadow_consensus' : 'partial_shadow_consensus',
        rows: scoredRows,
      },
      next_action: degraded
        ? 'collect_missing_agent_receipts_or_raise_confidence_before_any_class2_execution_design'
        : 'operator_may_review_phase16_quorum_receipt_contract',
      canon_law: [
        'Quorum integrity rules are scoring rules only in Phase 15.',
        'Missing agents create penalties and explicit degraded state; they are not hidden.',
        'Partial consensus is observable but not authoritative.',
        'No real quorum enforcement, seal execution, Canon promotion, Replay mutation, Vault mutation, Ledger write, MIC, Fountain, or GI mutation occurs here.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'quorum-integrity',
      },
    },
  );
}
