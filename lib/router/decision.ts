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
  cis_estimate: number | null;
  reason: string;
  verified_required: boolean;
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

export function createRouterDecisionRecord(task: RouterTask): RouterDecisionRecord {
  const decision = routeTask(task);
  const now = new Date().toISOString();
  return {
    id: `router-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    route: decision.route,
    task,
    cis_estimate: null,
    reason: decision.reason,
    verified_required: decision.verified_required,
    timestamp: now,
  };
}

export function summarizeRouterDecisions(records: RouterDecisionRecord[]) {
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

  return {
    total,
    byRoute,
    verifiedRequired,
    localShare,
    cloudVerifiedShare,
    cis_placeholder: null,
  };
}
