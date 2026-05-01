import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ReadinessPayload = {
  ok?: boolean;
  status?: 'blocked' | 'not_ready' | 'ready_for_dry_run';
  readiness_score?: number;
  checks?: Array<{ name: string; passed: boolean; severity: string; detail: string }>;
};

type Stage = {
  offset: string;
  label: string;
  agents: string[];
  simulated_status: 'planned' | 'blocked' | 'degraded';
  would_write: false;
  expected_receipts: string[];
  notes: string[];
};

async function fetchReadiness(request: NextRequest): Promise<ReadinessPayload> {
  const res = await fetch(new URL('/api/system/automation-readiness', request.nextUrl.origin), { cache: 'no-store' });
  return (await res.json()) as ReadinessPayload;
}

function buildStages(readiness: ReadinessPayload): Stage[] {
  const p0Failed = (readiness.checks ?? []).filter((check) => check.severity === 'p0' && !check.passed);
  const blocked = p0Failed.length > 0;

  return [
    {
      offset: 't+0:00',
      label: 'Bootstrap agents',
      agents: ['ATLAS', 'DAEDALUS', 'ECHO'],
      simulated_status: blocked ? 'blocked' : 'planned',
      would_write: false,
      expected_receipts: ['agent_journal_preview', 'heartbeat_preview', 'signal_ingest_preview'],
      notes: ['No agent code is executed in dry-run mode.', 'Would validate bootstrap health and source freshness.'],
    },
    {
      offset: 't+1:00',
      label: 'Vault attestation collection',
      agents: ['VAULT-ATTESTATION'],
      simulated_status: blocked ? 'blocked' : 'planned',
      would_write: false,
      expected_receipts: ['attestation_collection_preview', 'missing_agent_list'],
      notes: ['Would collect attestations without writing Vault state.', 'Partial attestations remain preview-only.'],
    },
    {
      offset: 't+3:00',
      label: 'Signal routing',
      agents: ['HERMES'],
      simulated_status: blocked ? 'blocked' : 'planned',
      would_write: false,
      expected_receipts: ['route_decision_preview', 'signal_source_health_preview'],
      notes: ['Would route signals through Mobius Router advisory mode.', 'No model execution or external fetch is performed.'],
    },
    {
      offset: 't+5:00',
      label: 'Quorum agents',
      agents: ['ZEUS', 'EVE', 'JADE', 'AUREA'],
      simulated_status: blocked ? 'blocked' : readiness.status === 'not_ready' ? 'degraded' : 'planned',
      would_write: false,
      expected_receipts: ['quorum_preview', 'ethics_review_preview', 'proof_lane_preview'],
      notes: ['Would simulate 5-agent quorum.', 'No ledger or seal writes are allowed.'],
    },
    {
      offset: 't+6:00',
      label: 'Seal eligibility check',
      agents: ['VAULT-ATTESTATION', 'ZEUS'],
      simulated_status: blocked ? 'blocked' : readiness.status === 'ready_for_dry_run' ? 'planned' : 'degraded',
      would_write: false,
      expected_receipts: ['seal_eligibility_preview', 'gi_gate_preview', 'sustain_gate_preview'],
      notes: ['Would evaluate GI, quorum, sustain, and degraded-agent count.', 'Even if eligible, dry-run cannot execute a seal.'],
    },
  ];
}

export async function GET(request: NextRequest) {
  const readiness = await fetchReadiness(request);
  const stages = buildStages(readiness);
  const blockedStages = stages.filter((stage) => stage.simulated_status === 'blocked').length;
  const degradedStages = stages.filter((stage) => stage.simulated_status === 'degraded').length;

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      dry_run: true,
      phase: 'C-298.phase10.orchestration-dry-run',
      readiness: {
        status: readiness.status ?? 'unknown',
        score: readiness.readiness_score ?? null,
        p0_failures: (readiness.checks ?? []).filter((check) => check.severity === 'p0' && !check.passed).map((check) => check.name),
      },
      orchestration_window: {
        cycle: 'C-298',
        duration: '10m',
        stages,
      },
      simulation_result: {
        executable: false,
        would_mutate: false,
        blocked_stages: blockedStages,
        degraded_stages: degradedStages,
        dry_run_status: blockedStages > 0 ? 'blocked_preview' : degradedStages > 0 ? 'degraded_preview' : 'clean_preview',
      },
      next_action:
        blockedStages > 0
          ? 'fix_p0_readiness_failures_before_orchestration_testing'
          : degradedStages > 0
            ? 'collect_more_feedback_and_resolve_not_ready_checks_before_execution_design'
            : 'operator_may_review_phase11_execution_contract_docs_only',
      canon_law: [
        'This endpoint simulates orchestration only.',
        'No cron jobs are run and no agents execute.',
        'No KV, Ledger, Vault, Canon, Replay, MIC, Fountain, GI, or seal mutation occurs.',
        'Dry-run output may inform a future execution contract but cannot itself become execution authority.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'orchestration-dry-run',
      },
    },
  );
}
