/**
 * EVE governance / ethics / civic-risk synthesis on live EPICON ledger (C-270).
 * Internal substrate first; optional external news enrichment; KV-backed publish.
 */

import { Redis } from '@upstash/redis';

import type { EveNewsItem, EveSynthesis, NewsCategory, Severity } from '@/lib/eve/global-news';
import { fetchEveGlobalNews } from '@/lib/eve/global-news';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { SonarSignal } from '@/lib/signals/perplexity-sonar';
import { querySonarForLane } from '@/lib/signals/perplexity-sonar';
import { getEchoAlerts, getEchoEpicon } from '@/lib/echo/store';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import { EVE_LEDGER_SYNTHESIS_SOURCE, isEveSynthesisLedgerSource } from '@/lib/epicon/eveLedgerSource';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { getMemoryLedgerEntries } from '@/lib/epicon/memoryLedgerFeed';
import { getLiveIntegritySnapshot } from '@/lib/integrity/buildStatus';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { mockCivicAlerts } from '@/lib/terminal/mock';
import type { CivicRadarAlert } from '@/lib/terminal/types';
import { getTreasuryAlerts } from '@/lib/treasury/alerts';
import { getTripwireState, type RuntimeTripwireState } from '@/lib/tripwire/store';

export const EVE_GOVERNANCE_SYNTH_TAG = 'eve-governance-synthesis';
export const EVE_SYNTHESIS_SOURCE = EVE_LEDGER_SYNTHESIS_SOURCE;

/** Align with EVE automation cadence (every 4h). */
const CYCLE_WINDOW_MS = 4 * 60 * 60 * 1000;
const GI_STRESS_THRESHOLD = 0.72;
const NARRATIVE_CLUSTER_THRESHOLD = 6;

export type EveSynthesizeMode = 'cycle' | 'escalation';

export type EveGovernanceSynthesisInput = {
  cycleId: string;
  gatheredAt: string;
  committedAgentRows: EpiconLedgerFeedEntry[];
  tripwire: ReturnType<typeof getTripwireState>;
  civicAlerts: CivicRadarAlert[];
  gi: number;
  mii: number;
  treasuryStatus: string;
  treasuryTripwireCount: number;
  treasuryAlertCount: number;
  narrativeClusterCount: number;
  externalDegraded: boolean;
  externalEnrichment: string | null;
  sonarCivic: SonarSignal | null;
};

export type EveGovernanceCategory = 'governance' | 'ethics' | 'civic-risk';

export type EveGovernanceSynthesisOutput = {
  title: string;
  summary: string;
  body: string;
  category: EveGovernanceCategory;
  severity: Severity;
  confidenceTier: number;
  governancePosture: 'stable' | 'watch' | 'stressed' | 'critical';
  ethicsFlags: string[];
  civicRiskLevel: 'low' | 'medium' | 'high';
  derivedFrom: string[];
};

/** Serializable substrate snapshot for `/api/eve/synthesis-input` (no model blobs). */
export type EveSynthesisInputPublic = {
  cycleId: string;
  gatheredAt: string;
  committedAgentMemory: Array<{
    id: string;
    timestamp: string;
    title: string;
    cycle?: string;
    author?: string;
    agentOrigin?: string;
  }>;
  tripwire: {
    active: boolean;
    level: string;
    reason: string;
    last_updated: string;
  };
  civicRadarAlerts: Array<Pick<CivicRadarAlert, 'id' | 'title' | 'severity' | 'timestamp'>>;
  integrity: { gi: number; mii: number };
  treasury: { status: string; tripwireCount: number; alertCount: number };
  narrativeClusterCount: number;
  external: { degraded: boolean; enrichmentPreview: string | null; sonarPreview: string | null };
};

export function buildNormalizedEveSynthesisInputSnapshot(
  input: EveGovernanceSynthesisInput,
): EveSynthesisInputPublic {
  const sonarAnswer = input.sonarCivic?.answer?.trim() ?? '';
  const sonarPreview =
    sonarAnswer.length > 0 ? `${sonarAnswer.slice(0, 280)}${sonarAnswer.length > 280 ? '…' : ''}` : null;

  return {
    cycleId: input.cycleId,
    gatheredAt: input.gatheredAt,
    committedAgentMemory: input.committedAgentRows.slice(0, 24).map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      title: row.title,
      cycle: row.cycle,
      author: row.author,
      agentOrigin: row.agentOrigin,
    })),
    tripwire: {
      active: input.tripwire.active,
      level: input.tripwire.level,
      reason: input.tripwire.reason,
      last_updated: input.tripwire.last_updated,
    },
    civicRadarAlerts: input.civicAlerts.slice(0, 12).map((a) => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      timestamp: a.timestamp,
    })),
    integrity: { gi: input.gi, mii: input.mii },
    treasury: {
      status: input.treasuryStatus,
      tripwireCount: input.treasuryTripwireCount,
      alertCount: input.treasuryAlertCount,
    },
    narrativeClusterCount: input.narrativeClusterCount,
    external: {
      degraded: input.externalDegraded,
      enrichmentPreview: input.externalEnrichment,
      sonarPreview,
    },
  };
}

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

export async function readLedgerRowsForEve(limit = 400): Promise<EpiconLedgerFeedEntry[]> {
  const rows: EpiconLedgerFeedEntry[] = [];
  const redis = getRedisClient();

  if (redis) {
    try {
      const [primary, alias] = await Promise.all([
        redis.lrange<string>('mobius:epicon:feed', 0, limit - 1),
        redis.lrange<string>('epicon:feed', 0, limit - 1),
      ]);

      for (const raw of [...primary, ...alias]) {
        try {
          rows.push(JSON.parse(raw) as EpiconLedgerFeedEntry);
        } catch {
          // ignore malformed rows
        }
      }
    } catch {
      // fall through to memory mirror
    }
  }

  rows.push(...getMemoryLedgerEntries(limit));

  const byId = new Map<string, EpiconLedgerFeedEntry>();
  for (const row of rows) {
    if (typeof row.id !== 'string' || !row.id) continue;
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }
    const tNew = Date.parse(row.timestamp);
    const tOld = Date.parse(existing.timestamp);
    if (!Number.isNaN(tNew) && !Number.isNaN(tOld) && tNew > tOld) {
      byId.set(row.id, row);
    }
  }

  return [...byId.values()].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.id.localeCompare(a.id),
  );
}

function severityRank(severity: Severity): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function scoreToSeverity(score: number): Severity {
  if (score < GI_STRESS_THRESHOLD) return 'high';
  if (score < 0.84) return 'medium';
  return 'low';
}

export function tensionFromHighestSeverity(highest: Severity): EveSynthesis['global_tension'] {
  if (highest === 'high') return 'high';
  if (highest === 'medium') return 'elevated';
  return 'moderate';
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 140);
}

export function cycleWindowBucket(nowMs: number): string {
  const w = Math.floor(nowMs / CYCLE_WINDOW_MS);
  return String(w);
}

export function cycleSynthesisIdempotencyTag(cycleId: string, windowBucket: string): string {
  return `eve-syn-cycle|${cycleId}|${windowBucket}`;
}

export function escalationFingerprint(input: EveGovernanceSynthesisInput): string {
  const giBucket = Math.floor(input.gi * 50);
  const tw = input.tripwire.level;
  const critRadar =
    input.civicAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length;
  const treasuryKey =
    input.treasuryStatus === 'critical' || input.treasuryStatus === 'stressed' ? input.treasuryStatus : 'other';
  const narr = input.narrativeClusterCount >= NARRATIVE_CLUSTER_THRESHOLD ? 'spike' : 'calm';
  return `${giBucket}|${tw}|${critRadar}|${treasuryKey}|${narr}`;
}

export function escalationIdempotencyTag(cycleId: string, fingerprint: string): string {
  return `eve-syn-esc|${cycleId}|${fingerprint}`;
}

/** True if this row is EVE governance synthesis (committed) carrying the window/escalation idempotency tag. */
export function ledgerHasIdempotencyTag(rows: EpiconLedgerFeedEntry[], tag: string): boolean {
  return rows.some((row) => {
    if (row.status !== 'committed' || !Array.isArray(row.tags) || !row.tags.includes(tag)) {
      return false;
    }
    if (isEveSynthesisLedgerSource(row.source)) return true;
    return row.agentOrigin === 'EVE' && row.tags.includes(EVE_GOVERNANCE_SYNTH_TAG);
  });
}

async function tryExternalEnrichment(): Promise<{ line: string | null; degraded: boolean }> {
  try {
    const syn = await fetchEveGlobalNews();
    const first = syn.items[0];
    const headline = first && typeof first.title === 'string' ? first.title.trim() : '';
    if (headline) {
      return {
        line: `External observation (non-blocking): ${headline.slice(0, 120)}`,
        degraded: false,
      };
    }
    return { line: null, degraded: false };
  } catch {
    return { line: null, degraded: true };
  }
}

function formatSonarExternalContext(sonar: SonarSignal | null): string | null {
  if (!sonar || !sonar.answer.trim()) return null;
  const sourceLine =
    sonar.sources.length > 0
      ? `Sources: ${sonar.sources.slice(0, 5).map((s) => s.url).join(', ')}`
      : 'Sources: none returned';
  return `external_context: ${sonar.answer.trim()}\n${sourceLine}`;
}

function parseLedgerTimestampMs(row: EpiconLedgerFeedEntry): number {
  const t = Date.parse(row.timestamp);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Prefer committed agent rows for the active cycle; if none (e.g. fresh cycle or KV lag),
 * use the most recent committed agent rows from any cycle so synthesis stays substrate-grounded.
 */
export function selectCommittedAgentRowsForSynthesis(
  ledgerRows: EpiconLedgerFeedEntry[],
  cycleId: string,
  crossCycleLimit = 24,
): EpiconLedgerFeedEntry[] {
  const forCycle = ledgerRows.filter(
    (row) => row.source === 'agent_commit' && row.status === 'committed' && row.cycle === cycleId,
  );
  if (forCycle.length > 0) return forCycle;

  return [...ledgerRows]
    .filter((row) => row.source === 'agent_commit' && row.status === 'committed')
    .sort(
      (a, b) => parseLedgerTimestampMs(b) - parseLedgerTimestampMs(a) || b.id.localeCompare(a.id),
    )
    .slice(0, crossCycleLimit);
}

export async function gatherEveGovernanceSynthesisInput(
  cycleId?: string,
  options?: { ledgerRows?: EpiconLedgerFeedEntry[] },
): Promise<EveGovernanceSynthesisInput> {
  const resolvedCycle = cycleId?.trim() || currentCycleId();
  const ledgerRows = options?.ledgerRows ?? (await readLedgerRowsForEve(400));

  const committedAgentRows = selectCommittedAgentRowsForSynthesis(ledgerRows, resolvedCycle);

  const tripwire = getTripwireState();
  const echoAlerts = getEchoAlerts();
  const civicAlerts = echoAlerts.length > 0 ? echoAlerts : mockCivicAlerts;

  let treasuryStatus = 'unavailable';
  let treasuryTripwireCount = 0;
  let treasuryAlertCount = 0;
  try {
    const treasury = await getTreasuryAlerts();
    treasuryStatus = treasury.status;
    treasuryTripwireCount = treasury.tripwires.length;
    treasuryAlertCount = treasury.alerts.length;
  } catch {
    // graceful degradation
  }

  let gi = integrityStatus.global_integrity;
  let mii = integrityStatus.mii_baseline;
  try {
    const live = await getLiveIntegritySnapshot();
    gi = live.global_integrity;
    mii = live.mii_baseline;
  } catch {
    // keep mock baseline; synthesis still runs from substrate rows
  }

  const echoEpicon = getEchoEpicon();
  const narrativeClusterCount = echoEpicon.length;

  const ext = await tryExternalEnrichment();
  const sonarCivic = await querySonarForLane(
    'EVE',
    'Civic risk, democratic accountability, and institutional governance news today. Focus on verified events.',
    'day',
    resolvedCycle,
  );
  const sonarContext = formatSonarExternalContext(sonarCivic);

  return {
    cycleId: resolvedCycle,
    gatheredAt: nowIso(),
    committedAgentRows,
    tripwire,
    civicAlerts,
    gi,
    mii,
    treasuryStatus,
    treasuryTripwireCount,
    treasuryAlertCount,
    narrativeClusterCount,
    externalDegraded: ext.degraded,
    externalEnrichment: [ext.line, sonarContext].filter((line): line is string => typeof line === 'string').join('\n\n') || null,
    sonarCivic,
  };
}

/** Tripwire levels that count as elevated/degraded for escalation (not baseline/nominal). */
const ESCALATION_TRIPWIRE_LEVELS = new Set<RuntimeTripwireState['level']>([
  'watch',
  'elevated',
  'medium',
  'high',
  'triggered',
  'suspended',
]);

export function escalationWarranted(input: EveGovernanceSynthesisInput): boolean {
  if (input.gi < GI_STRESS_THRESHOLD) return true;
  if (input.tripwire.active) return true;
  if (ESCALATION_TRIPWIRE_LEVELS.has(input.tripwire.level)) {
    return true;
  }
  if (input.civicAlerts.some((a) => a.severity === 'critical')) return true;
  if (input.treasuryStatus === 'critical' || input.treasuryStatus === 'stressed') return true;
  if (input.narrativeClusterCount >= NARRATIVE_CLUSTER_THRESHOLD) return true;
  return false;
}

function ledgerSeverityFromSignals(sev: Severity): EpiconLedgerFeedEntry['severity'] {
  if (sev === 'high') return 'high';
  if (sev === 'medium') return 'medium';
  return 'low';
}

export function buildEveGovernanceSynthesisOutput(input: EveGovernanceSynthesisInput): EveGovernanceSynthesisOutput {
  const actorSet = new Set(
    input.committedAgentRows
      .map((row) => row.agentOrigin ?? row.author)
      .filter((agent): agent is string => typeof agent === 'string' && agent.trim().length > 0),
  );
  const agentList = [...actorSet].sort();

  const giSeverity = scoreToSeverity(input.gi);
  const miiSeverity = scoreToSeverity(input.mii);
  const tripwireSeverity: Severity =
    input.tripwire.level === 'high' ||
    input.tripwire.level === 'triggered' ||
    input.tripwire.level === 'suspended'
      ? 'high'
      : input.tripwire.level === 'medium' ||
          input.tripwire.level === 'watch' ||
          input.tripwire.level === 'elevated'
        ? 'medium'
        : 'low';

  let combinedSeverity = maxSeverity(maxSeverity(giSeverity, miiSeverity), tripwireSeverity);
  if (input.civicAlerts.some((a) => a.severity === 'critical')) {
    combinedSeverity = maxSeverity(combinedSeverity, 'high');
  } else if (input.civicAlerts.filter((a) => a.severity === 'high').length >= 2) {
    combinedSeverity = maxSeverity(combinedSeverity, 'medium');
  }

  const civicRiskLevel: EveGovernanceSynthesisOutput['civicRiskLevel'] =
    combinedSeverity === 'high' ? 'high' : combinedSeverity === 'medium' ? 'medium' : 'low';

  const governancePosture: EveGovernanceSynthesisOutput['governancePosture'] =
    input.gi < 0.65 ? 'critical' : input.gi < GI_STRESS_THRESHOLD ? 'stressed' : tripwireSeverity !== 'low' ? 'watch' : 'stable';

  const ethicsFlags: string[] = [];
  if (input.tripwire.active) ethicsFlags.push('active-tripwire');
  if (input.gi < GI_STRESS_THRESHOLD) ethicsFlags.push('integrity-stress');
  if (input.narrativeClusterCount >= NARRATIVE_CLUSTER_THRESHOLD) ethicsFlags.push('narrative-cluster-spike');
  if (input.externalDegraded) ethicsFlags.push('external-feed-degraded');

  const derivedFrom: string[] = [];
  for (const row of input.committedAgentRows.slice(0, 12)) {
    if (typeof row.id === 'string' && row.id) derivedFrom.push(row.id);
  }
  for (const a of input.civicAlerts.slice(0, 5)) {
    if (typeof a.id === 'string') derivedFrom.push(`civic:${a.id}`);
  }
  if (input.tripwire.level !== 'none') {
    derivedFrom.push(`tripwire:${input.tripwire.level}`);
  }
  for (const source of input.sonarCivic?.sources ?? []) {
    derivedFrom.push(source.url);
  }

  const governanceSummary =
    `Cycle ${input.cycleId} substrate: ${input.committedAgentRows.length} committed agent row(s) ` +
    `from ${agentList.length > 0 ? agentList.join(', ') : 'no agent authors in-window'}. ` +
    `GI=${input.gi.toFixed(2)}, MII=${input.mii.toFixed(2)}. Treasury watch: ${input.treasuryStatus} ` +
    `(${input.treasuryTripwireCount} fiscal tripwire(s), ${input.treasuryAlertCount} alert(s)).`;

  const civicLine =
    `Civic radar: ${input.civicAlerts.length} alert(s); tripwire runtime: ${input.tripwire.level}` +
    (input.tripwire.active ? ` — ${input.tripwire.reason}` : '.');

  const ethicsLine = input.tripwire.active
    ? `Ethics / operator stance: treat narrative claims as subordinate to committed ledger evidence while tripwire ${input.tripwire.level} is active.`
    : 'Ethics / operator stance: no active runtime tripwire; maintain verification discipline and avoid narrative overreach.';

  const extLine = input.externalEnrichment ? `\n\n${input.externalEnrichment}` : '';

  let title: string;
  if (governancePosture === 'critical' || governancePosture === 'stressed') {
    title = sanitizeTitle(`EVE review: civic-risk elevated — integrity posture stressed in ${input.cycleId}`);
  } else if (ethicsFlags.includes('narrative-cluster-spike')) {
    title = sanitizeTitle(`EVE review: narrative-overreach risk exceeds verified evidence in ${input.cycleId}`);
  } else {
    title = sanitizeTitle(`EVE review: governance implications of substrate state — ${input.cycleId}`);
  }

  const summary = sanitizeTitle(
    `${governancePosture.toUpperCase()} posture · ${agentList.length} agent lane(s) · GI ${input.gi.toFixed(2)}`,
  );

  const body = [governanceSummary, civicLine, ethicsLine, extLine.trim() ? extLine : null]
    .filter((p): p is string => typeof p === 'string')
    .join('\n\n');

  const category: EveGovernanceCategory =
    civicRiskLevel === 'high' ? 'civic-risk' : ethicsFlags.length >= 2 ? 'ethics' : 'governance';

  const confidenceTier = combinedSeverity === 'high' && input.committedAgentRows.length >= 2 ? 3 : 2;

  return {
    title,
    summary,
    body,
    category,
    severity: combinedSeverity,
    confidenceTier,
    governancePosture,
    ethicsFlags,
    civicRiskLevel,
    derivedFrom,
  };
}

export function buildInternalPreviewFromInput(
  input: EveGovernanceSynthesisInput,
  output: EveGovernanceSynthesisOutput,
): {
  items: EveNewsItem[];
  pattern_notes: string[];
  dominant_category: NewsCategory;
  dominant_region: string;
  global_tension: EveSynthesis['global_tension'];
} {
  const timestamp = input.gatheredAt;
  const cycleId = input.cycleId;

  const items: EveNewsItem[] = [
    {
      id: `eve-internal-${cycleId.toLowerCase()}-governance`,
      title: output.title,
      summary: output.summary,
      url: '/api/epicon/feed',
      source: 'EVE Internal Substrate',
      region: 'System',
      timestamp,
      category: 'governance',
      severity: output.severity,
      eve_tag: 'Governance synthesis from committed substrate state',
    },
    {
      id: `eve-internal-${cycleId.toLowerCase()}-civic-risk`,
      title: sanitizeTitle(`EVE framing: civic-risk transmission watch for ${cycleId}`),
      summary:
        `Public-risk framing: ${input.civicAlerts.length} civic radar alert(s); ` +
        `treasury ${input.treasuryStatus}; narrative cluster size ${input.narrativeClusterCount}.`,
      url: '/api/echo/feed',
      source: 'EVE Civic Radar',
      region: 'Public Sphere',
      timestamp,
      category: 'civic-risk',
      severity: output.civicRiskLevel === 'high' ? 'high' : output.civicRiskLevel === 'medium' ? 'medium' : 'low',
      eve_tag: 'Civic-risk framing from internal signals',
    },
    {
      id: `eve-internal-${cycleId.toLowerCase()}-ethics`,
      title: sanitizeTitle(`EVE caution: ethics and verification posture for ${cycleId}`),
      summary:
        input.tripwire.active
          ? `Active tripwire (${input.tripwire.level}): ${input.tripwire.reason}`
          : 'No active tripwire; preserve evidence-first narration.',
      url: '/api/tripwire/status',
      source: 'EVE Integrity Posture',
      region: 'Operator',
      timestamp,
      category: 'ethics',
      severity:
        input.tripwire.level === 'high' || input.tripwire.level === 'triggered'
          ? 'high'
          : input.tripwire.level === 'watch' || input.tripwire.level === 'medium'
            ? 'medium'
            : 'low',
      eve_tag: 'Ethics and bias-aware operator caution',
    },
  ];

  const pattern_notes = [
    `Internal-first synthesis: ${input.committedAgentRows.length} committed agent rows in ${cycleId}.`,
    `Tripwire ${input.tripwire.level}; treasury ${input.treasuryStatus}; civic alerts ${input.civicAlerts.length}.`,
    input.externalDegraded
      ? 'External EVE news degraded — substrate-only synthesis.'
      : 'External observations optional; substrate remains authoritative.',
  ];

  return {
    items,
    pattern_notes,
    dominant_category: output.category === 'civic-risk' ? 'civic-risk' : 'governance',
    dominant_region: 'System',
    global_tension: tensionFromHighestSeverity(output.severity),
  };
}

export type PublishEveGovernanceResult = {
  published: boolean;
  entryId: string | null;
  idempotencyTag: string;
  ledgerSeverity: EpiconLedgerFeedEntry['severity'];
};

/** Trace block returned with synthesis HTTP responses (C-270). */
export type EveGovernanceSynthTrace = {
  committedAgentRows: number;
  tripwireLevel: string;
  civicAlertCount: number;
  gi: number;
  mii: number;
  treasuryStatus: string;
};

function buildSynthTrace(input: EveGovernanceSynthesisInput): EveGovernanceSynthTrace {
  return {
    committedAgentRows: input.committedAgentRows.length,
    tripwireLevel: input.tripwire.level,
    civicAlertCount: input.civicAlerts.length,
    gi: input.gi,
    mii: input.mii,
    treasuryStatus: input.treasuryStatus,
  };
}

/**
 * Cycle-window synthesis (idempotent per window unless force).
 * Does not run the signal engine — callers invoke that first if needed.
 */
export async function processEveCycleWindowSynthesis(
  cycleId: string,
  force: boolean,
): Promise<Record<string, unknown>> {
  const allRows = await readLedgerRowsForEve(400);
  const nowMs = Date.now();
  const windowBucket = force ? `force-${nowMs}` : cycleWindowBucket(nowMs);
  const idempotencyTag = cycleSynthesisIdempotencyTag(cycleId, windowBucket);

  if (!force && ledgerHasIdempotencyTag(allRows, idempotencyTag)) {
    return {
      ok: true,
      cycleId,
      mode: 'cycle' as const,
      published: false,
      reason: 'already_synthesized_for_window',
      windowBucket,
      idempotencyTag,
      derivedFromCount: 0,
    };
  }

  const input = await gatherEveGovernanceSynthesisInput(cycleId, { ledgerRows: allRows });
  const afterGather = await readLedgerRowsForEve(400);
  if (!force && ledgerHasIdempotencyTag(afterGather, idempotencyTag)) {
    return {
      ok: true,
      cycleId,
      mode: 'cycle' as const,
      published: false,
      reason: 'already_synthesized_for_window',
      windowBucket,
      idempotencyTag,
      derivedFromCount: 0,
    };
  }

  const output = buildEveGovernanceSynthesisOutput(input);
  const publishResult = await publishEveGovernanceSynthesis(input, output, idempotencyTag, afterGather);

  return {
    ok: true,
    cycleId,
    mode: 'cycle' as const,
    published: publishResult.published,
    entryId: publishResult.entryId,
    reason: publishResult.published ? 'cycle_window_due' : 'already_synthesized_for_window',
    windowBucket,
    derivedFromCount: output.derivedFrom.length,
    idempotencyTag: publishResult.idempotencyTag,
    governancePosture: output.governancePosture,
    category: output.category,
    civicRiskLevel: output.civicRiskLevel,
    ethicsFlags: output.ethicsFlags,
    summary: output.summary,
    externalDegraded: input.externalDegraded,
    trace: buildSynthTrace(input),
  };
}

/**
 * Escalation-class synthesis (idempotent per fingerprint unless force).
 * Does not run the signal engine — callers invoke that first if needed.
 */
export async function processEveEscalationSynthesis(
  cycleId: string,
  force: boolean,
  callerReason?: string | null,
): Promise<Record<string, unknown>> {
  const allRows = await readLedgerRowsForEve(400);
  const input = await gatherEveGovernanceSynthesisInput(cycleId, { ledgerRows: allRows });

  const trimmedReason = typeof callerReason === 'string' ? callerReason.trim() : '';

  if (!force && !escalationWarranted(input)) {
    return {
      ok: true,
      cycleId,
      mode: 'escalation' as const,
      published: false,
      reason: 'no_escalation_signal',
      derivedFromCount: 0,
    };
  }

  const baseFp = escalationFingerprint(input);
  const fingerprint =
    force ? `force-${Date.now()}` : trimmedReason !== '' ? `${baseFp}|${trimmedReason}` : baseFp;
  const idempotencyTag = escalationIdempotencyTag(cycleId, fingerprint);

  if (!force && ledgerHasIdempotencyTag(allRows, idempotencyTag)) {
    return {
      ok: true,
      cycleId,
      mode: 'escalation' as const,
      published: false,
      reason: 'already_synthesized_for_escalation_class',
      idempotencyTag,
      derivedFromCount: 0,
      escalationFingerprint: fingerprint,
    };
  }

  const output = buildEveGovernanceSynthesisOutput(input);
  const afterBuild = await readLedgerRowsForEve(400);
  if (!force && ledgerHasIdempotencyTag(afterBuild, idempotencyTag)) {
    return {
      ok: true,
      cycleId,
      mode: 'escalation' as const,
      published: false,
      reason: 'already_synthesized_for_escalation_class',
      idempotencyTag,
      derivedFromCount: 0,
      escalationFingerprint: fingerprint,
    };
  }

  const publishResult = await publishEveGovernanceSynthesis(input, output, idempotencyTag, afterBuild);

  const publishReason =
    publishResult.published && trimmedReason === 'gi_critical'
      ? 'gi_critical_escalation'
      : publishResult.published
        ? 'escalation_signal'
        : 'already_synthesized_for_escalation_class';

  return {
    ok: true,
    cycleId,
    mode: 'escalation' as const,
    published: publishResult.published,
    entryId: publishResult.entryId,
    reason: publishReason,
    derivedFromCount: output.derivedFrom.length,
    idempotencyTag: publishResult.idempotencyTag,
    escalationFingerprint: fingerprint,
    ...(trimmedReason !== '' ? { escalationReason: trimmedReason } : {}),
    governancePosture: output.governancePosture,
    category: output.category,
    civicRiskLevel: output.civicRiskLevel,
    ethicsFlags: output.ethicsFlags,
    summary: output.summary,
    externalDegraded: input.externalDegraded,
    trace: {
      ...buildSynthTrace(input),
      ...(trimmedReason ? { callerReason: trimmedReason } : {}),
    },
  };
}

export async function publishEveGovernanceSynthesis(
  input: EveGovernanceSynthesisInput,
  output: EveGovernanceSynthesisOutput,
  idempotencyTag: string,
  _allRowsSnapshot: EpiconLedgerFeedEntry[],
): Promise<PublishEveGovernanceResult> {
  const latestRows = await readLedgerRowsForEve(400);
  if (ledgerHasIdempotencyTag(latestRows, idempotencyTag)) {
    return { published: false, entryId: null, idempotencyTag, ledgerSeverity: ledgerSeverityFromSignals(output.severity) };
  }

  const seqToken = Date.now().toString(36).toUpperCase();
  const entryId = `EPICON-${input.cycleId}-EVE-SYN-${seqToken}`;
  const timestamp = nowIso();
  const ledgerSeverity = ledgerSeverityFromSignals(output.severity);

  const sonarEnriched = Boolean(input.sonarCivic?.answer.trim());
  const tags: string[] = [
    'eve',
    EVE_GOVERNANCE_SYNTH_TAG,
    idempotencyTag,
    output.category,
    ...(input.sonarCivic && input.sonarCivic.answer.trim() ? ['eve-sonar-enriched'] : []),
    ...output.ethicsFlags.map((f) => `ethics:${f}`),
  ];
  if (sonarEnriched) {
    tags.push('external-sonar-enriched', 'eve:sonar-enriched');
  }

  const derivedFromIds = output.derivedFrom.slice(0, 32);
  const derivedFromCompact = derivedFromIds.join('|').slice(0, 512);

  const ledgerSource = sonarEnriched ? `${EVE_LEDGER_SYNTHESIS_SOURCE}+sonar` : EVE_LEDGER_SYNTHESIS_SOURCE;

  const entry: EpiconLedgerFeedEntry = {
    id: entryId,
    timestamp,
    author: 'EVE',
    title: output.title,
    body: output.body,
    type: 'epicon',
    severity: ledgerSeverity,
    gi: input.gi,
    tags,
    source: ledgerSource,
    verified: true,
    verifiedBy: 'ZEUS',
    cycle: input.cycleId,
    category: output.category,
    confidenceTier: output.confidenceTier,
    derivedFrom: derivedFromCompact,
    derivedFromIds,
    status: 'committed',
    agentOrigin: 'EVE',
  };

  await pushLedgerEntry(entry);

  return { published: true, entryId, idempotencyTag, ledgerSeverity };
}
