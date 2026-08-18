export type ProductionDeploymentObservation = {
  base_url: string;
  observed_at: string;
  commit_sha: string | null;
  environment: string | null;
  bindable: boolean;
  errors: string[];
};

type SnapshotLiteDeployment = {
  commit_sha?: string | null;
  environment?: string | null;
};

type SnapshotLiteResponse = {
  ok?: boolean;
  deployment?: SnapshotLiteDeployment;
};

export async function observeProductionDeploymentCommit(args: {
  baseUrl: string;
  observedAt?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProductionDeploymentObservation> {
  const baseUrl = args.baseUrl.replace(/\/$/, '');
  const observedAt = args.observedAt ?? new Date().toISOString();
  const fetchImpl = args.fetchImpl ?? fetch;
  const errors: string[] = [];

  let commitSha: string | null = null;
  let environment: string | null = null;

  try {
    const response = await fetchImpl(`${baseUrl}/api/terminal/snapshot-lite`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      errors.push(`snapshot-lite HTTP ${response.status}`);
    } else {
      const body = (await response.json()) as SnapshotLiteResponse;
      commitSha = body.deployment?.commit_sha ?? null;
      environment = body.deployment?.environment ?? null;
      if (!commitSha) {
        errors.push('production deployment commit_sha missing from snapshot-lite');
      }
    }
  } catch (error) {
    errors.push(
      `snapshot-lite fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    base_url: baseUrl,
    observed_at: observedAt,
    commit_sha: commitSha,
    environment,
    bindable: commitSha !== null && errors.length === 0,
    errors,
  };
}

export function assertProductionCommitBinding(args: {
  checkedOutCommit: string;
  observedProductionCommit: string | null;
  requireMatch?: boolean;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!args.observedProductionCommit) {
    errors.push('production deployment commit cannot be bound to a git SHA');
    return { ok: false, errors };
  }
  if (args.requireMatch !== false && args.checkedOutCommit !== args.observedProductionCommit) {
    errors.push(
      `production commit mismatch: checked out ${args.checkedOutCommit}, observed ${args.observedProductionCommit}`,
    );
  }
  return { ok: errors.length === 0, errors };
}
