import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type FetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

type RouterMetrics = {
  ok?: boolean;
  summary?: {
    total?: number;
    estimatedCis?: number | null;
    feedback?: {
      total?: number;
      confirmationRate?: number | null;
      correctionRate?: number | null;
    };
  };
};

type RouterRecommendations = {
  ok?: boolean;
  recommendations?: Array<{
    route: string;
    recommendation: string;
    confidence: number;
  }>;
};

type AgentReasoning = {
  ok?: boolean;
  decisions?: unknown[];
  summary?: {
    active_actions?: number;
  };
};

type VaultContext = {
  ok?: boolean;
  endpoints?: Record<string, { ok?: boolean }>;
  agent_tasks?: string[];
};

async function getJson<T>(request: NextRequest, path: string): Promise<FetchResult<T>> {
  try {
    const response = await fetch(new URL(path, request.nextUrl.origin), { cache: 'no-store' });
    const data = (await response.json()) as T;
    return {
      ok: response.ok && (data as { ok?: boolean })?.ok !== false,
      status: response.status,
      data: response.ok ? data : null,
      error: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'fetch_failed',
    };
  }
}

function readinessLine(name: string, passed: boolean, detail: string, severity: 'p0' | 'p1' | 'p2' = 'p1') {
  return { name, passed, severity, detail };
}

export async function GET(request: NextRequest) {
  const [routerMetrics, routerRecommendations, agentReasoning, vaultContext] = await Promise.all([
    getJson<RouterMetrics>(request, '/api/router/metrics'),
    getJson<RouterRecommendations>(request, '/api/router/recommendations'),
    getJson<AgentReasoning>(request, '/api/agents/reasoning'),
    getJson<VaultContext>(request, '/api/agents/vault-context'),
  ]);

  const metrics = routerMetrics.data?.summary;
  const decisions = metrics?.total ?? 0;
  const feedback = metrics?.feedback?.total ?? 0;
  const estimatedCis = metrics?.estimatedCis ?? null;
  const correctionRate = metrics?.feedback?.correctionRate ?? null;
  const recommendations = routerRecommendations.data?.recommendations ?? [];
  const reviewCount = recommendations.filter((item) => item.recommendation === 'review' || item.recommendation === 'use_less').length;
  const agentDecisionCount = agentReasoning.data?.decisions?.length ?? 0;
  const activeActions = agentReasoning.data?.summary?.active_actions ?? 0;
  const vaultEndpoints = vaultContext.data?.endpoints ?? {};
  const vaultReadable = Object.values(vaultEndpoints).filter((endpoint) => endpoint?.ok).length;

  const checks = [
    readinessLine('router_metrics_available', routerMetrics.ok, `router metrics endpoint status=${routerMetrics.status}`, 'p0'),
    readinessLine('router_decision_density', decisions >= 5, `${decisions} router decisions recorded; target >=5 before automation`, 'p1'),
    readinessLine('router_feedback_density', feedback >= 3, `${feedback} feedback records recorded; target >=3 before adaptation`, 'p1'),
    readinessLine('compute_integrity_floor', estimatedCis != null && estimatedCis >= 0.75, `estimated CIS=${estimatedCis ?? 'unknown'}; target >=0.75`, 'p0'),
    readinessLine('correction_rate_safe', correctionRate == null || correctionRate <= 0.35, `correction rate=${correctionRate ?? 'unknown'}; target <=0.35`, 'p1'),
    readinessLine('recommendations_not_overheated', reviewCount <= 1, `${reviewCount} routes need review/use_less; target <=1`, 'p1'),
    readinessLine('agent_reasoning_available', agentReasoning.ok && agentDecisionCount > 0, `${agentDecisionCount} agent decisions visible`, 'p0'),
    readinessLine('active_actions_visible', activeActions >= 0, `${activeActions} active agent actions visible`, 'p2'),
    readinessLine('vault_canon_replay_context_available', vaultContext.ok && vaultReadable >= 2, `${vaultReadable} vault/canon/replay endpoints readable`, 'p0'),
  ];

  const p0Failed = checks.filter((check) => check.severity === 'p0' && !check.passed);
  const failed = checks.filter((check) => !check.passed);
  const score = Number((checks.filter((check) => check.passed).length / checks.length).toFixed(3));
  const status = p0Failed.length > 0 ? 'blocked' : failed.length > 0 ? 'not_ready' : 'ready_for_dry_run';

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      phase: 'C-298.phase9.automation-readiness',
      status,
      readiness_score: score,
      checks,
      endpoints: {
        router_metrics: { ok: routerMetrics.ok, status: routerMetrics.status, error: routerMetrics.error },
        router_recommendations: { ok: routerRecommendations.ok, status: routerRecommendations.status, error: routerRecommendations.error },
        agent_reasoning: { ok: agentReasoning.ok, status: agentReasoning.status, error: agentReasoning.error },
        vault_context: { ok: vaultContext.ok, status: vaultContext.status, error: vaultContext.error },
      },
      next_action:
        status === 'ready_for_dry_run'
          ? 'allow_phase10_dry_run_orchestration_plan_only'
          : p0Failed.length > 0
            ? 'fix_p0_readiness_failures_before_any_orchestration'
            : 'collect_more_router_decisions_and_feedback_before_dry_run',
      canon_law: [
        'Automation readiness is a gate, not execution.',
        'This endpoint does not run cron jobs, agents, model calls, ledger writes, seals, replay, Canon, Vault, MIC, Fountain, or GI mutation.',
        'No automation should move past dry-run until p0 checks pass and operator review confirms readiness.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'automation-readiness',
      },
    },
  );
}
