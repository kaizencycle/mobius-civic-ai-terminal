/**
 * Sentinel Review policy — fail-closed aggregation for AUREA, ATLAS, and EVE lanes.
 * C-411 JOB-4: missing/unavailable/malformed review must never infer PASS or consensus:approved.
 */

export type SentinelReviewer = 'AUREA' | 'ATLAS' | 'EVE';

export type SentinelLaneState =
  | 'PASS'
  | 'FAIL'
  | 'DEGRADED_UNAVAILABLE'
  | 'DEGRADED_FALLBACK'
  | 'NOT_REQUESTED'
  | 'MALFORMED';

export type SentinelIndependence = 'independent' | 'shared_provider' | 'unknown';

export type SentinelLaneResult = {
  reviewer: SentinelReviewer;
  state: SentinelLaneState;
  provider: string;
  model: string;
  independence: SentinelIndependence;
  blocking: string[];
  non_blocking: string[];
  summary: string;
  observed_at: string;
  routing_disposition: string[];
};

export type SentinelReviewDisposition = {
  approval_eligible: boolean;
  consensus_approved: boolean;
  overall: 'PASS' | 'FAIL' | 'DEGRADED';
  lanes: SentinelLaneResult[];
  blocking: string[];
  non_blocking: string[];
  routing_disposition: string[];
  summary: string;
};

export type LegacyVerdictJson = {
  verdict?: string;
  blocking?: string[];
  non_blocking?: string[];
  summary?: string;
};

export const SENTINEL_REVIEW_TRIGGER_LABELS = [
  'review:aurea',
  'review:atlas',
  'review:eve',
  'consensus:requested',
  'consensus:approved',
  'needs-custodian-review',
] as const;

export const SENTINEL_PASS_LABEL = 'consensus:approved' as const;
export const SENTINEL_DEGRADED_LABEL = 'review:degraded' as const;

const FULL_QUORUM_LABELS = new Set([
  'consensus:requested',
  'consensus:approved',
  'needs-custodian-review',
]);

const REVIEWER_LABEL: Record<SentinelReviewer, string> = {
  AUREA: 'review:aurea',
  ATLAS: 'review:atlas',
  EVE: 'review:eve',
};

const REVIEWER_PROVIDERS: Record<
  SentinelReviewer,
  { primary: string; primaryModel: string; fallback?: string; fallbackModel?: string }
> = {
  AUREA: { primary: 'openai', primaryModel: 'gpt-4o-mini' },
  ATLAS: { primary: 'anthropic', primaryModel: 'claude-sonnet-4-20250514' },
  EVE: {
    primary: 'anthropic',
    primaryModel: 'claude-sonnet-4-20250514',
    fallback: 'openai',
    fallbackModel: 'gpt-4o-mini',
  },
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeStringArray(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  return uniqueStrings(value.filter((entry): entry is string => typeof entry === 'string'));
}

export function validateLegacyVerdictJson(raw: unknown): LegacyVerdictJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const blocking = normalizeStringArray(candidate.blocking);
  const nonBlocking = normalizeStringArray(candidate.non_blocking);
  if (blocking === null || nonBlocking === null) return null;
  const verdict = typeof candidate.verdict === 'string' ? candidate.verdict : undefined;
  const summary = typeof candidate.summary === 'string' ? candidate.summary : undefined;
  return { verdict, blocking, non_blocking: nonBlocking, summary };
}

export function shouldRunSentinelReview(labels: string[]): {
  run: boolean;
  matched: string[];
  reason: string;
} {
  const matched = labels.filter((label) =>
    (SENTINEL_REVIEW_TRIGGER_LABELS as readonly string[]).includes(label),
  );
  if (matched.length === 0) {
    return {
      run: false,
      matched,
      reason: 'No sentinel review trigger labels present.',
    };
  }
  return {
    run: true,
    matched,
    reason: `Matched trigger label(s): ${matched.join(', ')}`,
  };
}

export function determineRequiredReviewers(labels: string[]): SentinelReviewer[] {
  if (labels.some((label) => FULL_QUORUM_LABELS.has(label))) {
    return ['AUREA', 'ATLAS', 'EVE'];
  }

  const required: SentinelReviewer[] = [];
  if (labels.includes(REVIEWER_LABEL.AUREA)) required.push('AUREA');
  if (labels.includes(REVIEWER_LABEL.ATLAS)) required.push('ATLAS');
  if (labels.includes(REVIEWER_LABEL.EVE)) required.push('EVE');

  if (required.length === 0) {
    return ['AUREA', 'ATLAS', 'EVE'];
  }
  return required;
}

export function laneNotRequested(reviewer: SentinelReviewer, observedAt: string): SentinelLaneResult {
  const provider = REVIEWER_PROVIDERS[reviewer];
  return {
    reviewer,
    state: 'NOT_REQUESTED',
    provider: provider.primary,
    model: provider.primaryModel,
    independence: reviewer === 'AUREA' ? 'independent' : 'shared_provider',
    blocking: [],
    non_blocking: [`${reviewer} review not requested for this PR label set.`],
    summary: `${reviewer} not requested.`,
    observed_at: observedAt,
    routing_disposition: [],
  };
}

export function laneFromMissingCredential(args: {
  reviewer: SentinelReviewer;
  observedAt: string;
  credential: string;
}): SentinelLaneResult {
  const provider = REVIEWER_PROVIDERS[args.reviewer];
  const routing =
    args.reviewer === 'EVE' ? ['ZEUS', 'HUMAN'] : args.reviewer === 'ATLAS' ? ['ZEUS'] : [];
  return {
    reviewer: args.reviewer,
    state: 'DEGRADED_UNAVAILABLE',
    provider: provider.primary,
    model: provider.primaryModel,
    independence: args.reviewer === 'AUREA' ? 'independent' : 'shared_provider',
    blocking: [`${args.reviewer} unavailable: ${args.credential} not configured`],
    non_blocking: [],
    summary: `${args.reviewer} review unavailable — credential missing.`,
    observed_at: args.observedAt,
    routing_disposition: routing,
  };
}

export function laneFromHttpFailure(args: {
  reviewer: SentinelReviewer;
  observedAt: string;
  provider: string;
  model: string;
  independence: SentinelIndependence;
  httpStatus: number;
}): SentinelLaneResult {
  const routing = args.reviewer === 'EVE' ? ['ZEUS', 'HUMAN'] : args.reviewer === 'ATLAS' ? ['ZEUS'] : [];
  const degradedStatuses = new Set([401, 402, 403, 429, 500, 502, 503, 504]);
  const state: SentinelLaneState = degradedStatuses.has(args.httpStatus)
    ? 'DEGRADED_UNAVAILABLE'
    : 'FAIL';
  return {
    reviewer: args.reviewer,
    state,
    provider: args.provider,
    model: args.model,
    independence: args.independence,
    blocking: [`${args.reviewer} provider HTTP ${args.httpStatus}`],
    non_blocking: [],
    summary: `${args.reviewer} provider request failed (HTTP ${args.httpStatus}).`,
    observed_at: args.observedAt,
    routing_disposition: routing,
  };
}

export function laneFromMalformed(args: {
  reviewer: SentinelReviewer;
  observedAt: string;
  provider: string;
  model: string;
  independence: SentinelIndependence;
  detail: string;
}): SentinelLaneResult {
  const routing = args.reviewer === 'EVE' ? ['ZEUS', 'HUMAN'] : [];
  return {
    reviewer: args.reviewer,
    state: 'MALFORMED',
    provider: args.provider,
    model: args.model,
    independence: args.independence,
    blocking: [`${args.reviewer} output malformed: ${args.detail}`],
    non_blocking: [],
    summary: `${args.reviewer} output malformed — fail closed.`,
    observed_at: args.observedAt,
    routing_disposition: routing,
  };
}

export function laneFromFallbackAdvice(args: {
  reviewer: SentinelReviewer;
  observedAt: string;
  provider: string;
  model: string;
  parsed: LegacyVerdictJson;
  reason: string;
}): SentinelLaneResult {
  const routing = args.reviewer === 'EVE' ? ['ZEUS', 'HUMAN'] : [];
  const advisoryBlocking = normalizeStringArray(args.parsed.blocking) ?? [];
  return {
    reviewer: args.reviewer,
    state: 'DEGRADED_FALLBACK',
    provider: args.provider,
    model: args.model,
    independence: 'shared_provider',
    blocking: uniqueStrings([
      `${args.reviewer} fallback advisory is not independent quorum`,
      ...advisoryBlocking,
    ]),
    non_blocking: uniqueStrings([
      args.reason,
      ...(normalizeStringArray(args.parsed.non_blocking) ?? []),
      typeof args.parsed.summary === 'string' ? args.parsed.summary : '',
    ]),
    summary:
      args.parsed.summary ??
      `${args.reviewer} fallback advisory emitted — not independent attestation.`,
    observed_at: args.observedAt,
    routing_disposition: routing,
  };
}

export function laneFromLegacyVerdict(args: {
  reviewer: SentinelReviewer;
  observedAt: string;
  provider: string;
  model: string;
  independence: SentinelIndependence;
  parsed: LegacyVerdictJson | null;
}): SentinelLaneResult {
  if (!args.parsed) {
    return laneFromMalformed({
      reviewer: args.reviewer,
      observedAt: args.observedAt,
      provider: args.provider,
      model: args.model,
      independence: args.independence,
      detail: 'empty output',
    });
  }

  const validated = validateLegacyVerdictJson(args.parsed);
  if (!validated) {
    return laneFromMalformed({
      reviewer: args.reviewer,
      observedAt: args.observedAt,
      provider: args.provider,
      model: args.model,
      independence: args.independence,
      detail: 'invalid verdict field types',
    });
  }

  const blocking = uniqueStrings(validated.blocking ?? []);
  const nonBlocking = uniqueStrings(validated.non_blocking ?? []);
  const verdict = (validated.verdict ?? '').trim().toLowerCase();
  const state: SentinelLaneState =
    verdict === 'pass' && blocking.length === 0
      ? 'PASS'
      : verdict === 'fail' || blocking.length > 0
        ? 'FAIL'
        : 'MALFORMED';

  return {
    reviewer: args.reviewer,
    state,
    provider: args.provider,
    model: args.model,
    independence: args.independence,
    blocking,
    non_blocking: nonBlocking,
    summary: validated.summary ?? `${args.reviewer} review completed.`,
    observed_at: args.observedAt,
    routing_disposition: state === 'FAIL' && args.reviewer === 'EVE' ? ['ZEUS', 'HUMAN'] : [],
  };
}

function laneBlocksApproval(lane: SentinelLaneResult, required: boolean): boolean {
  if (!required) return false;
  switch (lane.state) {
    case 'PASS':
      return false;
    case 'NOT_REQUESTED':
      return true;
    case 'FAIL':
    case 'DEGRADED_UNAVAILABLE':
    case 'DEGRADED_FALLBACK':
    case 'MALFORMED':
      return true;
    default: {
      const _exhaustive: never = lane.state;
      return _exhaustive;
    }
  }
}

export function validateRequiredLaneCoverage(args: {
  lanes: SentinelLaneResult[];
  requiredReviewers: SentinelReviewer[];
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const counts = new Map<SentinelReviewer, number>();
  for (const lane of args.lanes) {
    counts.set(lane.reviewer, (counts.get(lane.reviewer) ?? 0) + 1);
  }
  for (const [reviewer, count] of counts) {
    if (count > 1) {
      errors.push(`${reviewer} has ${count} lane outcomes — expected exactly one`);
    }
  }
  for (const reviewer of args.requiredReviewers) {
    if (!counts.has(reviewer)) {
      errors.push(`${reviewer} required but missing from lane outcomes`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function laneMeetsApprovalIndependence(lane: SentinelLaneResult): boolean {
  if (lane.state !== 'PASS') return false;
  switch (lane.reviewer) {
    case 'AUREA':
      return lane.independence === 'independent' && lane.provider === 'openai';
    case 'ATLAS':
      return lane.provider === 'anthropic';
    case 'EVE':
      return lane.provider === 'anthropic' && lane.independence === 'shared_provider';
    default: {
      const _exhaustive: never = lane.reviewer;
      return _exhaustive;
    }
  }
}

export const SENTINEL_MANAGED_LABELS = [
  SENTINEL_PASS_LABEL,
  SENTINEL_DEGRADED_LABEL,
  'needs-custodian-review',
] as const;

export function filterLabelUpdatesByAvailable(args: {
  updates: { add: string[]; remove: string[] };
  availableLabels: string[];
}): { add: string[]; remove: string[]; skipped: string[] } {
  const available = new Set(args.availableLabels);
  const skipped = args.updates.add.filter((label) => !available.has(label));
  return {
    add: args.updates.add.filter((label) => available.has(label)),
    remove: args.updates.remove.filter((label) => available.has(label)),
    skipped,
  };
}

function laneIsDegraded(lane: SentinelLaneResult): boolean {
  switch (lane.state) {
    case 'DEGRADED_UNAVAILABLE':
    case 'DEGRADED_FALLBACK':
    case 'MALFORMED':
      return true;
    case 'PASS':
    case 'FAIL':
    case 'NOT_REQUESTED':
      return false;
    default: {
      const _exhaustive: never = lane.state;
      return _exhaustive;
    }
  }
}

export function aggregateSentinelReview(args: {
  lanes: SentinelLaneResult[];
  requiredReviewers: SentinelReviewer[];
}): SentinelReviewDisposition {
  const laneByReviewer = new Map(args.lanes.map((lane) => [lane.reviewer, lane]));
  const coverage = validateRequiredLaneCoverage({
    lanes: args.lanes,
    requiredReviewers: args.requiredReviewers,
  });

  const approvalEligible =
    coverage.ok &&
    args.requiredReviewers.every((reviewer) => {
      const lane = laneByReviewer.get(reviewer);
      return lane != null && laneMeetsApprovalIndependence(lane);
    });

  const blocking = uniqueStrings([
    ...coverage.errors,
    ...args.requiredReviewers.flatMap((reviewer) => {
      const lane = laneByReviewer.get(reviewer);
      if (!lane) return [];
      if (!laneMeetsApprovalIndependence(lane) && lane.state === 'PASS') {
        return [`${reviewer} PASS rejected — independence/provider policy not satisfied`];
      }
      return laneBlocksApproval(lane, true) ? lane.blocking : [];
    }),
  ]);
  const nonBlocking = uniqueStrings(args.lanes.flatMap((lane) => lane.non_blocking));
  const routing = uniqueStrings(args.lanes.flatMap((lane) => lane.routing_disposition));

  const anyDegraded = args.requiredReviewers.some((reviewer) => {
    const lane = laneByReviewer.get(reviewer);
    return lane != null && laneIsDegraded(lane);
  });
  const anyFail = args.requiredReviewers.some((reviewer) => {
    const lane = laneByReviewer.get(reviewer);
    return lane != null && (lane.state === 'FAIL' || lane.state === 'MALFORMED');
  });
  const anyMissing = !coverage.ok;

  let overall: SentinelReviewDisposition['overall'];
  if (approvalEligible) {
    overall = 'PASS';
  } else if (anyMissing || anyDegraded) {
    overall = 'DEGRADED';
  } else if (anyFail) {
    overall = 'FAIL';
  } else {
    overall = 'DEGRADED';
  }

  const eveRequired = args.requiredReviewers.includes('EVE');
  const eveLane = args.lanes.find((lane) => lane.reviewer === 'EVE');
  const finalRouting =
    eveRequired && eveLane && laneIsDegraded(eveLane)
      ? uniqueStrings([...routing, 'ZEUS', 'HUMAN'])
      : routing;

  const summary = approvalEligible
    ? 'All required sentinel lanes passed.'
    : anyMissing
      ? 'Sentinel review incomplete — required lane outcomes missing.'
      : anyDegraded
        ? 'Sentinel review degraded — unresolved lanes require ZEUS and/or human review.'
        : 'Sentinel review failed — blocking issues present.';

  return {
    approval_eligible: approvalEligible,
    consensus_approved: approvalEligible,
    overall,
    lanes: args.lanes,
    blocking,
    non_blocking: nonBlocking,
    routing_disposition: finalRouting,
    summary,
  };
}

export function computeLabelUpdates(args: {
  disposition: SentinelReviewDisposition;
  currentLabels: string[];
}): { add: string[]; remove: string[] } {
  const current = new Set(args.currentLabels);
  const add: string[] = [];
  const remove: string[] = [];

  if (args.disposition.approval_eligible) {
    if (!current.has(SENTINEL_PASS_LABEL)) add.push(SENTINEL_PASS_LABEL);
    if (current.has(SENTINEL_DEGRADED_LABEL)) remove.push(SENTINEL_DEGRADED_LABEL);
  } else {
    if (current.has(SENTINEL_PASS_LABEL)) remove.push(SENTINEL_PASS_LABEL);
    const eveLane = args.disposition.lanes.find((lane) => lane.reviewer === 'EVE');
    const eveDegraded =
      eveLane &&
      (eveLane.state === 'DEGRADED_UNAVAILABLE' ||
        eveLane.state === 'DEGRADED_FALLBACK' ||
        eveLane.state === 'MALFORMED');
    if (eveDegraded && !current.has(SENTINEL_DEGRADED_LABEL)) add.push(SENTINEL_DEGRADED_LABEL);
    if (!current.has('needs-custodian-review')) add.push('needs-custodian-review');
  }

  return { add: uniqueStrings(add), remove: uniqueStrings(remove) };
}

function formatLaneSection(lane: SentinelLaneResult): string[] {
  return [
    `### ${lane.reviewer} — ${lane.state}`,
    lane.summary ? `> ${lane.summary}` : '',
    `**Provider:** ${lane.provider}`,
    `**Model:** ${lane.model}`,
    `**Independence:** ${lane.independence}`,
    `**Observed:** ${lane.observed_at}`,
    lane.routing_disposition.length
      ? `**Routing disposition:** ${lane.routing_disposition.join(' + ')}`
      : '',
    lane.blocking.length ? `**Blocking:** ${lane.blocking.join('; ')}` : '',
    lane.non_blocking.length ? `**Notes:** ${lane.non_blocking.join('; ')}` : '',
    '',
  ].filter((line) => line !== '');
}

export function renderSentinelReviewComment(disposition: SentinelReviewDisposition): string {
  const icon =
    disposition.overall === 'PASS' ? '✅ PASS' : disposition.overall === 'FAIL' ? '❌ FAIL' : '⚠️ DEGRADED';
  const lines = [
    '## 🤖 Sentinel Review',
    '',
    `**Result:** ${icon}`,
    disposition.approval_eligible
      ? '**Approval eligible:** yes (`consensus:approved` may be applied)'
      : '**Approval eligible:** no (`consensus:approved` blocked)',
    disposition.routing_disposition.length
      ? `**Routing disposition:** ${disposition.routing_disposition.join(' + ')}`
      : '',
    '',
    '---',
    '',
    ...disposition.lanes.flatMap((lane) => formatLaneSection(lane)),
    '---',
    '*Missing, unavailable, malformed, or fallback output never counts as independent EVE approval.*',
  ];
  return lines.filter((line) => line !== undefined).join('\n');
}

export function parseLegacyVerdictJson(raw: string | null | undefined): LegacyVerdictJson | null {
  if (!raw || !raw.trim()) return null;
  try {
    return validateLegacyVerdictJson(JSON.parse(raw));
  } catch {
    return null;
  }
}

export type ReviewStepOutcome =
  | { kind: 'not_requested'; reviewer: SentinelReviewer }
  | { kind: 'missing_credential'; reviewer: SentinelReviewer; credential: string }
  | {
      kind: 'http_error';
      reviewer: SentinelReviewer;
      provider: string;
      model: string;
      independence: SentinelIndependence;
      httpStatus: number;
    }
  | {
      kind: 'legacy_json';
      reviewer: SentinelReviewer;
      provider: string;
      model: string;
      independence: SentinelIndependence;
      raw: string;
    }
  | {
      kind: 'fallback_json';
      reviewer: SentinelReviewer;
      provider: string;
      model: string;
      raw: string;
      reason: string;
    };

export function laneFromStepOutcome(outcome: ReviewStepOutcome, observedAt: string): SentinelLaneResult {
  switch (outcome.kind) {
    case 'not_requested':
      return laneNotRequested(outcome.reviewer, observedAt);
    case 'missing_credential':
      return laneFromMissingCredential({
        reviewer: outcome.reviewer,
        observedAt,
        credential: outcome.credential,
      });
    case 'http_error':
      return laneFromHttpFailure({
        reviewer: outcome.reviewer,
        observedAt,
        provider: outcome.provider,
        model: outcome.model,
        independence: outcome.independence,
        httpStatus: outcome.httpStatus,
      });
    case 'legacy_json': {
      const parsed = parseLegacyVerdictJson(outcome.raw);
      return laneFromLegacyVerdict({
        reviewer: outcome.reviewer,
        observedAt,
        provider: outcome.provider,
        model: outcome.model,
        independence: outcome.independence,
        parsed,
      });
    }
    case 'fallback_json': {
      const parsed = parseLegacyVerdictJson(outcome.raw) ?? {};
      return laneFromFallbackAdvice({
        reviewer: outcome.reviewer,
        observedAt,
        provider: outcome.provider,
        model: outcome.model,
        parsed,
        reason: outcome.reason,
      });
    }
    default: {
      const _exhaustive: never = outcome;
      throw new Error(`Unhandled review step outcome: ${String(_exhaustive)}`);
    }
  }
}

export function buildDispositionFromStepOutcomes(args: {
  labels: string[];
  outcomes: ReviewStepOutcome[];
  observedAt: string;
}): SentinelReviewDisposition {
  const requiredReviewers = determineRequiredReviewers(args.labels);
  const lanes = args.outcomes.map((outcome) => laneFromStepOutcome(outcome, args.observedAt));
  return aggregateSentinelReview({ lanes, requiredReviewers });
}

export function findFailOpenWorkflowPatterns(source: string): string[] {
  const patterns = [
    /verdict:\s*"pass"[\s\S]{0,120}not configured/i,
    /verdict:\s*'pass'[\s\S]{0,120}not configured/i,
    /verdict:\s*['"]pass['"][\s\S]{0,80}skipped/i,
    /return\s*\{\s*verdict:\s*['"]pass['"][\s\S]{0,80}parse failed/i,
    /\(A\.verdict\s*\|\|\s*['"]pass['"]\)/,
    /\(T\.verdict\s*\|\|\s*['"]pass['"]\)/,
    /\(E\.verdict\s*\|\|\s*['"]pass['"]\)/,
  ];
  return patterns.filter((pattern) => pattern.test(source)).map((pattern) => pattern.source);
}
