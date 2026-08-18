export const TRACK_R_P3_ALLOWED_PRODUCTION_BASE_URLS = [
  'https://mobius-civic-ai-terminal.vercel.app',
] as const;

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

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;

export function normalizeGitSha(sha: string | null | undefined): {
  ok: boolean;
  sha: string | null;
  errors: string[];
} {
  if (!sha) {
    return { ok: false, sha: null, errors: ['git SHA missing'] };
  }
  const trimmed = sha.trim().toLowerCase();
  if (!FULL_GIT_SHA.test(trimmed)) {
    return {
      ok: false,
      sha: null,
      errors: ['git SHA must be a full 40-character lowercase hex commit'],
    };
  }
  return { ok: true, sha: trimmed, errors: [] };
}

export function assertProductionBaseUrlAllowed(baseUrl: string): { ok: boolean; errors: string[] } {
  const normalized = baseUrl.replace(/\/$/, '');
  if (
    !TRACK_R_P3_ALLOWED_PRODUCTION_BASE_URLS.includes(
      normalized as (typeof TRACK_R_P3_ALLOWED_PRODUCTION_BASE_URLS)[number],
    )
  ) {
    return {
      ok: false,
      errors: [`production base URL not allowlisted: ${normalized}`],
    };
  }
  return { ok: true, errors: [] };
}

export async function observeProductionDeploymentCommit(args: {
  baseUrl: string;
  observedAt?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProductionDeploymentObservation> {
  const baseUrl = args.baseUrl.replace(/\/$/, '');
  const observedAt = args.observedAt ?? new Date().toISOString();
  const fetchImpl = args.fetchImpl ?? fetch;
  const errors: string[] = [];

  errors.push(...assertProductionBaseUrlAllowed(baseUrl).errors);

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
      const rawSha = body.deployment?.commit_sha ?? null;
      environment = body.deployment?.environment ?? null;
      const normalizedSha = normalizeGitSha(rawSha);
      if (!normalizedSha.ok) {
        errors.push(...normalizedSha.errors);
      } else {
        commitSha = normalizedSha.sha;
      }
      if (environment !== 'production') {
        errors.push(`deployment.environment must be production; got ${environment ?? 'missing'}`);
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
    bindable: commitSha !== null && environment === 'production' && errors.length === 0,
    errors,
  };
}

export function assertProductionCommitBinding(args: {
  checkedOutCommit: string;
  observedProductionCommit: string | null;
  observedEnvironment: string | null;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  const checkedOut = normalizeGitSha(args.checkedOutCommit);
  const observed = normalizeGitSha(args.observedProductionCommit);

  if (!checkedOut.ok) {
    errors.push(...checkedOut.errors.map((detail) => `checked out commit invalid: ${detail}`));
  }
  if (!observed.ok) {
    errors.push(
      ...observed.errors.map((detail) => `observed production commit invalid: ${detail}`),
    );
  }
  if (args.observedEnvironment !== 'production') {
    errors.push(`deployment.environment must be production; got ${args.observedEnvironment ?? 'missing'}`);
  }
  if (
    checkedOut.ok &&
    observed.ok &&
    checkedOut.sha !== observed.sha
  ) {
    errors.push(
      `production commit mismatch: checked out ${checkedOut.sha}, observed ${observed.sha}`,
    );
  }

  return { ok: errors.length === 0, errors };
}
