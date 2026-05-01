export type RouterRoute = 'local' | 'cloud' | 'cloud+zeus' | 'hybrid';

export type RouterTask = {
  type?: string;
  affectsLedger?: boolean;
  highImpact?: boolean;
  repetitive?: boolean;
  private?: boolean;
  agent?: string;
};

export type RouterDecisionRecord = {
  id: string;
  route: RouterRoute;
  task: RouterTask;
  cis_estimate: number;
  cost_estimate: number;
  latency_class: 'low' | 'medium' | 'high';
  reason: string;
  verified_required: boolean;
  timestamp: string;
};

export type RouterFeedbackRecord = {
  id: string;
  decision_id: string;
  outcome: 'confirmed' | 'corrected' | 'rejected' | 'unknown';
  operator_note?: string;
  actual_cis?: number;
  actual_cost?: number;
  timestamp: string;
};

export function routeTask(task: RouterTask): { route: RouterRoute; reason: string; verified_required: boolean } {
  if (task.affectsLedger) {
    return { route: 'cloud+zeus', reason: 'task_affects_ledger_or_truth_layer', verified_required: true };
  }
  if (task.highImpact) {
    return { route: 'cloud', reason: 'high_impact_decision_requires_cloud_reasoning', verified_required: true };
  }
  if (task.repetitive) {
    return { route: 'local', reason: 'repetitive_task_can_run_local', verified_required: false };
  }
  if (task.private) {
    return { route: 'local', reason: 'private_task_prefers_local_compute', verified_required: false };
  }
  return { route: 'hybrid', reason: 'ambiguous_task_requires_local_first_cloud_verify', verified_required: true };
}

export function estimateComputeIntegrity(route: RouterRoute, verifiedRequired: boolean): {
  cis_estimate: number;
  cost_estimate: number;
  latency_class: RouterDecisionRecord['latency_class'];
} {
  if (route === 'cloud+zeus') {
    return { cis_estimate: 0.96, cost_estimate: 0.85, latency_class: 'high' };
  }
  if (route === 'cloud') {
    return { cis_estimate: 0.9, cost_estimate: 0.7, latency_class: 'medium' };
  }
  if (route === 'hybrid') {
    return { cis_estimate: 0.86, cost_estimate: 0.55, latency_class: 'medium' };
  }
  return {
    cis_estimate: verifiedRequired ? 0.62 : 0.72,
    cost_estimate: 0.1,
    latency_class: 'low',
  };
}

export function createRouterDecisionRecord(task: RouterTask): RouterDecisionRecord {
  const decision = routeTask(task);
  const estimate = estimateComputeIntegrity(decision.route, decision.verified_required);
  const now = new Date().toISOString();
  return {
    id: `router-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    route: decision.route,
    task,
    ...estimate,
    reason: decision.reason,
    verified_required: decision.verified_required,
    timestamp: now,
  };
}

export function createRouterFeedbackRecord(args: {
  decision_id: string;
  outcome: RouterFeedbackRecord['outcome'];
  operator_note?: string;
  actual_cis?: number;
  actual_cost?: number;
}): RouterFeedbackRecord {
  return {
    id: `router-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    decision_id: args.decision_id,
    outcome: args.outcome,
    operator_note: args.operator_note,
    actual_cis: typeof args.actual_cis === 'number' ? Math.max(0, Math.min(1, args.actual_cis)) : undefined,
    actual_cost: typeof args.actual_cost === 'number' ? Math.max(0, args.actual_cost) : undefined,
    timestamp: new Date().toISOString(),
  };
}

export function summarizeRouterFeedback(records: RouterFeedbackRecord[]) {
  const total = records.length;
  const confirmed = records.filter((record) => record.outcome === 'confirmed').length;
  const corrected = records.filter((record) => record.outcome === 'corrected').length;
  const rejected = records.filter((record) => record.outcome === 'rejected').length;
  const actualCisRows = records.filter((record) => typeof record.actual_cis === 'number');
  const actualCostRows = records.filter((record) => typeof record.actual_cost === 'number');
  return {
    total,
    confirmed,
    corrected,
    rejected,
    confirmationRate: total > 0 ? Number((confirmed / total).toFixed(3)) : null,
    correctionRate: total > 0 ? Number(((corrected + rejected) / total).toFixed(3)) : null,
    actualCis: actualCisRows.length > 0 ? Number((actualCisRows.reduce((sum, record) => sum + (record.actual_cis ?? 0), 0) / actualCisRows.length).toFixed(3)) : null,
    actualCost: actualCostRows.length > 0 ? Number((actualCostRows.reduce((sum, record) => sum + (record.actual_cost ?? 0), 0) / actualCostRows.length).toFixed(3)) : null,
  };
}

export function summarizeRouterDecisions(records: RouterDecisionRecord[], feedback: RouterFeedbackRecord[] = []) {
  const total = records.length;
  const byRoute = records.reduce<Record<RouterRoute, number>>(
    (acc, record) => {
      acc[record.route] += 1;
      return acc;
    },
    { local: 0, cloud: 0, 'cloud+zeus': 0, hybrid: 0 },
  );
  const verifiedRequired = records.filter((record) => record.verified_required).length;
  const localShare = total > 0 ? Number((byRoute.local / total).toFixed(3)) : 0;
  const cloudVerifiedShare = total > 0 ? Number(((byRoute.cloud + byRoute['cloud+zeus'] + byRoute.hybrid) / total).toFixed(3)) : 0;
  const estimatedCis = total > 0 ? Number((records.reduce((sum, record) => sum + record.cis_estimate, 0) / total).toFixed(3)) : null;
  const estimatedCost = total > 0 ? Number((records.reduce((sum, record) => sum + record.cost_estimate, 0) / total).toFixed(3)) : null;
  const feedbackSummary = summarizeRouterFeedback(feedback);

  return {
    total,
    byRoute,
    verifiedRequired,
    localShare,
    cloudVerifiedShare,
    estimatedCis,
    estimatedCost,
    cis_mode: feedbackSummary.actualCis == null ? 'policy_estimate' : 'policy_plus_feedback',
    feedback: feedbackSummary,
  };
}
