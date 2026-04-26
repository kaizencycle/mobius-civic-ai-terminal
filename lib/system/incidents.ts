import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { kvGet, kvLpushCapped, kvSet } from '@/lib/kv/store';

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
const INCIDENT_INDEX_MAX = 200;
const PREFIX = 'mobius:';

let redisClient: Redis | null | undefined;

function incidentKey(id: string): string {
  return `system:incident:${id}`;
}

function prefixed(key: string): string {
  return `${PREFIX}${key}`;
}

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return null;
  }
  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
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
  return `INC-${cycle}-${randomUUID()}`;
}

async function readIndex(limit = INCIDENT_INDEX_MAX): Promise<string[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const ids = await redis.lrange<string>(prefixed(INCIDENT_INDEX_KEY), 0, Math.max(0, limit - 1));
      return Array.isArray(ids) ? ids : [];
    } catch {
      // Fall through to legacy array index read below.
    }
  }
  const legacyIds = await kvGet<string[]>(INCIDENT_INDEX_KEY);
  return Array.isArray(legacyIds) ? legacyIds.slice(-limit).reverse() : [];
}

async function appendIndex(id: string): Promise<boolean> {
  // LPUSH avoids the lost-update read/modify/write race from array index writes.
  return kvLpushCapped(INCIDENT_INDEX_KEY, id, INCIDENT_INDEX_MAX);
}

export async function listIncidents(limit = 50): Promise<IncidentRecord[]> {
  const ids = await readIndex(Math.max(1, Math.min(100, limit)));
  const rows = await Promise.all(ids.map((id) => kvGet<IncidentRecord>(incidentKey(id))));
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

  const recordWritten = await kvSet(incidentKey(id), record, INCIDENT_TTL_SECONDS);
  if (!recordWritten) throw new Error('incident_record_persistence_failed');

  const indexWritten = await appendIndex(id);
  if (!indexWritten) throw new Error('incident_index_persistence_failed');

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
