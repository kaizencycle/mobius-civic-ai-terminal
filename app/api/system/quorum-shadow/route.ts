import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OrchestrationDryRun = {
  ok?: boolean;
  readiness?: {
    status?: string;
    score?: number | null;
    p0_failures?: string[];
  };
  orchestration_window?: {
    stages?: Array<{
      offset: string;
      label: string;
      agents: string[];
      simulated_status: 'planned' | 'blocked' | 'degraded';
      expected_receipts: string[];
    }>;
  };
  simulation_result?: {
    dry_run_status?: string;
    blocked_stages?: number;
    degraded_stages?: number;
  };
};

type AgentReasoning = {
  ok?: boolean;
  decisions?: Array<{
    agent: string;
    action: string;
    priority: string;
    confidence: number;
    router?: {
      route: string;
      verified_required: boolean;
    };
  }>;
};

async function getJson<T>(request: NextRequest, path: string): Promise<T | null> {
  try {
    const response = await fetch(new URL(path, request.nextUrl.origin), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function evaluateShadowQuorum(decisions: AgentReasoning['decisions'] = []) {
  const requiredAgents = ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'];
  const rows = requiredAgents.map((agent) => {
    const decision = decisions.find((item) => item.agent === agent);
    const confidence = decision?.confidence ?? 0;
    const passed = confidence >= 0.85 && decision?.router?.verified_required === true;
    return {
      agent,
      present: Boolean(decision),
      confidence,
      passed,
      action: decision?.action ?? 'missing',
      route: decision?.router?.route ?? 'unknown',
    };
  });
  const passed = rows.filter((row) => row.passed).length;
  const present = rows.filter((row) => row.present).length;
  return {
    required_agents: requiredAgents,
    threshold: 5,
    present,
    passed,
    quorum_met_shadow: passed >= 5,
    rows,
  };
}

export async function GET(request: NextRequest) {
  const [dryRun, reasoning] = await Promise.all([
    getJson<OrchestrationDryRun>(request, '/api/system/orchestration-dry-run'),
    getJson<AgentReasoning>(request, '/api/agents/reasoning'),
  ]);

  const quorum = evaluateShadowQuorum(reasoning?.decisions ?? []);
  const dryRunStatus = dryRun?.simulation_result?.dry_run_status ?? 'unknown';
  const p0Failures = dryRun?.readiness?.p0_failures ?? [];
  const blocked = p0Failures.length > 0 || dryRunStatus === 'blocked_preview';

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      shadow_mode: true,
      phase: 'C-298.phase13.quorum-shadow-mode',
      dry_run_status: dryRunStatus,
      readiness: dryRun?.readiness ?? null,
      quorum,
      shadow_result: {
        consensus_state: blocked ? 'blocked' : quorum.quorum_met_shadow ? 'shadow_pass' : 'shadow_fail',
        authoritative: false,
        can_seal: false,
        can_promote_canon: false,
        would_mutate: false,
      },
      next_action: blocked
        ? 'fix_readiness_failures_before_shadow_quorum_can_be_trusted'
        : quorum.quorum_met_shadow
          ? 'operator_may_review_phase14_receipt_to_quorum_mapping_docs'
          : 'collect_stronger_agent_reasoning_or_receipts_before_any_quorum_execution_design',
      canon_law: [
        'Shadow quorum is not authoritative quorum.',
        'This endpoint does not write attestations, execute seals, promote Canon, mutate Replay, or change GI.',
        'A future Class 2 phase must use real receipts, timeout behavior, missing-agent reports, and operator review before any enforcement.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'quorum-shadow-mode',
      },
    },
  );
}
