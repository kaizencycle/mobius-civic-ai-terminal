import { NextRequest, NextResponse } from 'next/server';
import { routeTask, type RouterRoute } from '@/lib/router/decision';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type JsonObject = Record<string, unknown>;

type FetchResult<T extends JsonObject> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

type AgentDecision = {
  agent: string;
  role: string;
  action: 'observe' | 'stabilize' | 'verify' | 'attest' | 'replay_check' | 'escalate';
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  reasoning: string;
  inputs: string[];
};

type RoutedAgentDecision = AgentDecision & {
  router: {
    route: RouterRoute;
    reason: string;
    verified_required: boolean;
    enforced: false;
  };
};

async function getJson<T extends JsonObject>(request: NextRequest, path: string): Promise<FetchResult<T>> {
  try {
    const response = await fetch(new URL(path, request.nextUrl.origin), { cache: 'no-store' });
    const data = (await response.json()) as T;
    return {
      ok: response.ok && data?.ok !== false,
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

function numberFrom(path: unknown, fallback = 0): number {
  return typeof path === 'number' && Number.isFinite(path) ? path : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function routerTaskForDecision(decision: AgentDecision) {
  const affectsLedger = decision.action === 'verify' || decision.action === 'attest' || decision.action === 'replay_check';
  const highImpact = decision.priority === 'critical' || decision.priority === 'high' || decision.action === 'stabilize' || decision.action === 'escalate';
  const repetitive = decision.action === 'observe';
  const privateTask = decision.inputs.some((input) => input.includes('vault') || input.includes('canon') || input.includes('replay'));
  return {
    type: `agent:${decision.agent}:${decision.action}`,
    agent: decision.agent,
    affectsLedger,
    highImpact,
    repetitive,
    private: privateTask,
  };
}

function annotateWithRouter(decisions: AgentDecision[]): RoutedAgentDecision[] {
  return decisions.map((decision) => {
    const routed = routeTask(routerTaskForDecision(decision));
    return {
      ...decision,
      router: {
        route: routed.route,
        reason: routed.reason,
        verified_required: routed.verified_required,
        enforced: false,
      },
    };
  });
}

function decideAgents(signalExplain: JsonObject | null, vaultContext: JsonObject | null): AgentDecision[] {
  const signalSnapshot = signalExplain?.signal_snapshot as JsonObject | null | undefined;
  const giState = signalExplain?.gi_state as JsonObject | null | undefined;
  const vault = vaultContext?.vault as JsonObject | null | undefined;
  const replay = vaultContext?.replay as JsonObject | null | undefined;
  const agentTasks = stringArray(vaultContext?.agent_tasks);

  const gi = numberFrom((giState as JsonObject | undefined)?.global_integrity, numberFrom((signalSnapshot as JsonObject | undefined)?.composite, 0));
  const anomalyCount = numberFrom((signalSnapshot as JsonObject | undefined)?.anomalyCount, 0);
  const criticalCount = numberFrom((signalSnapshot as JsonObject | undefined)?.criticalCount, 0);
  const instrumentCount = numberFrom((signalSnapshot as JsonObject | undefined)?.instrumentCount, 0);
  const quarantined = numberFrom((vault as JsonObject | undefined)?.seals_quarantined_count, 0);
  const candidate = (vault as JsonObject | undefined)?.candidate_attestation_state as JsonObject | null | undefined;
  const candidateInFlight = Boolean(candidate?.in_flight);
  const replayRebuild = (replay as JsonObject | undefined)?.rebuild as JsonObject | null | undefined;
  const replayPossible = replayRebuild ? Boolean(replayRebuild.possible) : false;

  const signalRisk = criticalCount > 0 ? 'critical' : anomalyCount > 5 ? 'high' : anomalyCount > 0 ? 'medium' : 'low';
  const baseConfidence = Math.max(0.35, Math.min(0.95, gi || 0.5));

  return [
    {
      agent: 'ATLAS',
      role: 'anomaly sentinel',
      action: criticalCount > 0 || anomalyCount > 5 ? 'escalate' : 'observe',
      priority: signalRisk,
      confidence: baseConfidence,
      reasoning: `ATLAS sees ${anomalyCount} anomalies, ${criticalCount} critical signals, across ${instrumentCount} instruments.`,
      inputs: ['signals.gi-explain.signal_snapshot', 'signals.gi-explain.top_drivers'],
    },
    {
      agent: 'AUREA',
      role: 'stabilization governor',
      action: gi < 0.95 ? 'stabilize' : 'observe',
      priority: gi < 0.85 ? 'critical' : gi < 0.95 ? 'high' : 'low',
      confidence: baseConfidence,
      reasoning: `AUREA evaluates GI ${gi.toFixed(3)} against sustain/readiness needs before seal progression.`,
      inputs: ['signals.gi-explain.gi_state', 'agents.vault-context.vault.sustain'],
    },
    {
      agent: 'ZEUS',
      role: 'verification authority',
      action: candidateInFlight || quarantined > 0 ? 'verify' : 'observe',
      priority: quarantined > 0 ? 'high' : candidateInFlight ? 'medium' : 'low',
      confidence: baseConfidence,
      reasoning: `ZEUS checks candidate attestations and ${quarantined} quarantined seal(s) before canon promotion.`,
      inputs: ['agents.vault-context.vault.candidate_attestation_state', 'agents.vault-context.vault.seals_needing_reattestation'],
    },
    {
      agent: 'JADE',
      role: 'proof lane witness',
      action: quarantined > 0 ? 'attest' : 'observe',
      priority: quarantined > 0 ? 'high' : 'low',
      confidence: baseConfidence,
      reasoning: `JADE should inspect proof continuity for ${quarantined} quarantined seal(s) and verify ledger-confirmed receipts.`,
      inputs: ['agents.vault-context.canon', 'agents.vault-context.effective_state'],
    },
    {
      agent: 'EVE',
      role: 'ethics and canon boundary reviewer',
      action: replayPossible || quarantined > 0 ? 'replay_check' : 'observe',
      priority: quarantined > 0 ? 'high' : 'medium',
      confidence: baseConfidence,
      reasoning: `EVE confirms replay/canon overlays preserve history and do not rewrite canonical truth.`,
      inputs: ['agents.vault-context.replay.rebuild', 'agents.vault-context.canon_law'],
    },
    {
      agent: 'ECHO',
      role: 'event pulse recorder',
      action: 'observe',
      priority: agentTasks.some((task) => task.includes('MISSING')) ? 'high' : 'medium',
      confidence: baseConfidence,
      reasoning: 'ECHO should pulse agent tasks into operator awareness without writing new truth automatically.',
      inputs: ['agents.vault-context.agent_tasks', 'signals.gi-explain.alignment'],
    },
    {
      agent: 'HERMES',
      role: 'routing and duplication auditor',
      action: 'verify',
      priority: 'medium',
      confidence: baseConfidence,
      reasoning: 'HERMES should verify signal/vault/canon/replay route consistency before downstream quorum writes.',
      inputs: ['agents.vault-context.endpoints', 'signals.gi-explain.source'],
    },
    {
      agent: 'DAEDALUS',
      role: 'build and systems engineer',
      action: 'verify',
      priority: 'medium',
      confidence: baseConfidence,
      reasoning: 'DAEDALUS should validate endpoint availability and build health before promoting agent reasoning to UI surfaces.',
      inputs: ['terminal.snapshot-health', 'vercel.build'],
    },
  ];
}

export async function GET(request: NextRequest) {
  const [signalExplain, vaultContext] = await Promise.all([
    getJson<JsonObject>(request, '/api/signals/gi-explain'),
    getJson<JsonObject>(request, '/api/agents/vault-context'),
  ]);

  const decisions = annotateWithRouter(decideAgents(signalExplain.data, vaultContext.data));

  return NextResponse.json(
    {
      ok: signalExplain.ok || vaultContext.ok,
      readonly: true,
      version: 'C-298.phase3.agent-reasoning-router-annotated.v1',
      source: 'signals-plus-vault-canon-replay-router-annotated',
      endpoints: {
        signal_gi_explain: { ok: signalExplain.ok, status: signalExplain.status, error: signalExplain.error },
        vault_context: { ok: vaultContext.ok, status: vaultContext.status, error: vaultContext.error },
      },
      router: {
        enforced: false,
        note: 'Router recommendations are metadata only in C-298 Phase 3.',
      },
      decisions,
      summary: {
        total_agents: decisions.length,
        critical: decisions.filter((d) => d.priority === 'critical').length,
        high: decisions.filter((d) => d.priority === 'high').length,
        active_actions: decisions.filter((d) => d.action !== 'observe').length,
        routes: decisions.reduce<Record<RouterRoute, number>>(
          (acc, d) => {
            acc[d.router.route] += 1;
            return acc;
          },
          { local: 0, cloud: 0, 'cloud+zeus': 0, hybrid: 0 },
        ),
      },
      canon_law: [
        'Agent reasoning must be grounded in canonical signals and Vault/Canon/Replay context.',
        'Router annotations recommend compute route only; they do not execute models or enforce routes yet.',
        'Future write phases must require receipts, quorum, preserved history, and verified cloud/ZEUS path when truth layers are affected.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'agent-reasoning-router-annotated',
      },
    },
  );
}
