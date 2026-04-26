import { currentCycleId } from '@/lib/eve/cycle-engine';
import { kvGet, kvSet } from '@/lib/kv/store';

export const INCIDENT_PROTOCOL_VERSION = 'C-293.phase6.v1' as const;

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentState = 'open' | 'monitoring' | 'resolved' | 'dismissed';
export type RollbackRecommendation = 'none' | 'fallback' | 'revert_pr' | 'redeploy_previous' | 'operator_review';

export type IncidentRecord = {
  incident_id: string;
  version: typeof INCIDENT_PROTOCOL_VERSION;
  cycle: string;
  severity: IncidentSeverity;
  state: IncidentState;
  affected: string[];
  trigger: string;
  evidence: string[];
  fallback: string;
  rollback_recommended: boolean;
  rollback_recommendation: RollbackRecommendation;
  operator_required: boolean;
  created_at: string;
  updated_at: string;
  source: string;
  canon: string;
};

export type RollbackPlan = {
  ok: boolean;
  version: typeof INCIDENT_PROTOCOL_VERSION;
  timestamp: string;
  incident_id: string | null;
  rollback_allowed: false;
  operator_required: true;
  recommendation: RollbackRecommendation;
  steps: string[];
  checks_before_action: string[];
  forbidden: string[];
  canon: string;
};

type ReportIncidentInput = {
  severity?: IncidentSeverity;
  affected?: string[];
  trigger?: string;
  evidence?: string[];
  fallback?: string;
  source?: string;
  rollback_recommendation?: RollbackRecommendation;
};

const INCIDENT_INDEX_KEY = 'system:incidents:index';
const INCIDENT_TTL_SECONDS = 60 * 60 * 24 * 90;

function incidentKey(id: string): string {
  return `system:incident:${id}`;
}

function normalizeSeverity(value: unknown): IncidentSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function normalizeRecommendation(value: unknown, severity: IncidentSeverity): RollbackRecommendation {
  if (value === 'fallback' || value === 'revert_pr' || value === 'redeploy_previous' || value === 'operator_review' || value === 'none') {
    return value;
  }
  if (severity === 'critical') return 'redeploy_previous';
  if (severity === 'high') return 'fallback';
  return 'operator_review';
}

function nextIncidentId(cycle: string): string {
  const suffix = Date.now().toString(36).toUpperCase();
  return `INC-${cycle}-${suffix}`;
}

async function readIndex(): Promise<string[]> {
  const ids = await kvGet<string[]>(INCIDENT_INDEX_KEY);
  return Array.isArray(ids) ? ids : [];
}

async function writeIndex(ids: string[]): Promise<void> {
  await kvSet(INCIDENT_INDEX_KEY, Array.from(new Set(ids)).slice(-200), INCIDENT_TTL_SECONDS);
}

export async function listIncidents(limit = 50): Promise<IncidentRecord[]> {
  const ids = await readIndex();
  const recent = ids.slice(-Math.max(1, Math.min(100, limit))).reverse();
  const rows = await Promise.all(recent.map((id) => kvGet<IncidentRecord>(incidentKey(id))));
  return rows.filter((row): row is IncidentRecord => Boolean(row));
}

export async function getIncident(id: string): Promise<IncidentRecord | null> {
  return kvGet<IncidentRecord>(incidentKey(id));
}

export async function reportIncident(input: ReportIncidentInput): Promise<IncidentRecord> {
  const cycle = currentCycleId();
  const now = new Date().toISOString();
  const severity = normalizeSeverity(input.severity);
  const recommendation = normalizeRecommendation(input.rollback_recommendation, severity);
  const id = nextIncidentId(cycle);
  const record: IncidentRecord = {
    incident_id: id,
    version: INCIDENT_PROTOCOL_VERSION,
    cycle,
    severity,
    state: 'open',
    affected: Array.from(new Set((input.affected ?? ['unknown']).map((x) => String(x).trim()).filter(Boolean))),
    trigger: String(input.trigger ?? 'manual_report'),
    evidence: (input.evidence ?? []).map((x) => String(x)).filter(Boolean).slice(0, 25),
    fallback: String(input.fallback ?? 'use savepoint cache and replay dry-run before mutation'),
    rollback_recommended: recommendation !== 'none',
    rollback_recommendation: recommendation,
    operator_required: true,
    created_at: now,
    updated_at: now,
    source: String(input.source ?? 'operator'),
    canon: 'Incidents are never erased by rollback. Rollback must preserve the incident trail.',
  };
  await kvSet(incidentKey(id), record, INCIDENT_TTL_SECONDS);
  const ids = await readIndex();
  ids.push(id);
  await writeIndex(ids);
  return record;
}

export function buildRollbackPlan(incident: IncidentRecord | null): RollbackPlan {
  const recommendation = incident?.rollback_recommendation ?? 'operator_review';
  const steps = [
    'Run /api/system/replay/plan and confirm rebuild confidence.',
    'Inspect affected chamber endpoints and recent deployment/build logs.',
    'Confirm savepoint cache or previous deployment is available.',
    'Have operator choose fallback, revert PR, or redeploy previous deployment outside this endpoint.',
    'Record follow-up journal/incident update after action.',
  ];

  if (recommendation === 'fallback') steps.splice(2, 0, 'Serve saved chamber state while hot lane recovers.');
  if (recommendation === 'revert_pr') steps.splice(2, 0, 'Identify the PR/commit to revert and create a reviewable revert PR.');
  if (recommendation === 'redeploy_previous') steps.splice(2, 0, 'Identify last known good deployment and redeploy through Vercel/operator controls.');

  return {
    ok: true,
    version: INCIDENT_PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    incident_id: incident?.incident_id ?? null,
    rollback_allowed: false,
    operator_required: true,
    recommendation,
    steps,
    checks_before_action: [
      'Replay dry-run reviewed',
      'State machine transition impact understood',
      'No evidence will be deleted',
      'Operator approves action',
      'Rollback path has a forward-fix plan',
    ],
    forbidden: [
      'auto_rollback_without_operator',
      'delete_incident_evidence',
      'erase_ledger_or_substrate_records',
      'unlock_fountain_as_rollback_side_effect',
    ],
    canon: 'Rollback is survival, not erasure. No rollback without proof, operator consent, and preserved incident history.',
  };
}
