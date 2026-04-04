/**
 * C-270 — EVE governance / ethics / civic-risk synthesis on the live EPICON ledger.
 * Internal substrate first; optional external news is layered by callers (e.g. global-news).
 */

import { Redis } from '@upstash/redis';

import type { EveNewsItem, EveSynthesis, NewsCategory, Severity } from '@/lib/eve/global-news';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { getMemoryLedgerEntries } from '@/lib/epicon/memoryLedgerFeed';
import { getEchoAlerts, getEchoEpicon } from '@/lib/echo/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { mockCivicAlerts } from '@/lib/terminal/mock';
import { kvGet, kvSet } from '@/lib/kv/store';
import { getTreasuryAlerts } from '@/lib/treasury/alerts';
import { getTripwireState } from '@/lib/tripwire/store';

export const EVE_GOVERNANCE_TAG = 'eve-governance-synth';
export const EVE_GOVERNANCE_VERSION = 'c270-v1';

const GI_ESCALATION_THRESHOLD = 0.82;
const CIVIC_CRITICAL_ESCALATION = 1;
const NARRATIVE_CLUSTER_ESCALATION = 4;

const KV_LAST_CYCLE = 'eve:gov:last_cycle_synth';
const KV_LAST_ESCAL_SIG = 'eve:gov:last_escalation_sig';
const ESCALATION_SIG_TTL_SEC = 86400;

/** Warm-instance idempotency when Redis/KV is not configured or writes fail. */
let memoryLastCyclePublished: string | null = null;
let memoryLastEscalationSig: string | null = null;

export type EveSynthesisInput = {
  cycleId: string;
  timestamp: string;
  committedAgentRows: EpiconLedgerFeedEntry[];
  agentAuthors: string[];
  tripwire: ReturnType<typeof getTripwireState>;
  civicAlerts: ReturnType<typeof getEchoAlerts>;
  treasury: {
    status: string;
    tripwireCount: number;
    alertCount: number;
    degraded: boolean;
  };
  gi: number;
  mii: number;
  narrativeClusterCount: number;
  externalEnrichment: {
    available: boolean;
    itemCount: number;
    degradedReason?: string;
  };
};

export type EveGovernanceSynthesisOutput = {
  title: string;
  summary: string;
  body: string;
  category: NewsCategory;
  severity: Severity;
  confidenceTier: 0 | 1 | 2 | 3 | 4;
  governancePosture: 'stable' | 'watch' | 'stressed';
  ethicsFlags: string[];
  civicRiskLevel: 'low' | 'medium' | 'high';
  derivedFrom: string[];
};

export type EveGovernanceRunMode = 'cycle' | 'escalation';

export type EveGovernanceSynthesisResult = {
  ok: true;
  cycleId: string;
  mode: EveGovernanceRunMode;
  published: boolean;
  entryId: string | null;
  reason: string;
  derivedFromCount: number;
  synthesis: EveGovernanceSynthesisOutput | null;
  input: EveSynthesisInput;
};

function getRedisLedgerClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function readLedgerRows(limit = 300): Promise<EpiconLedgerFeedEntry[]> {
  const rows: EpiconLedgerFeedEntry[] = [];
  const redis = getRedisLedgerClient();

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
  return rows;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 140);
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
  if (score < 0.72) return 'high';
  if (score < 0.84) return 'medium';
  return 'low';
}

function tripwireToSeverity(level: string): Severity {
  if (level === 'high' || level === 'triggered' || level === 'suspended' || level === 'elevated') return 'high';
  if (level === 'medium' || level === 'watch') return 'medium';
  return 'low';
}

function ledgerIdCycle(cycleId: string): string {
  return `LE-${cycleId}-EVE-GOV-SYNTH`;
}

function ledgerIdEscalation(cycleId: string, token: string): string {
  return `LE-${cycleId}-EVE-ESCAL-${token}`;
}

function countCriticalCivic(alerts: ReturnType<typeof getEchoAlerts>): number {
  return alerts.filter((a) => a.severity === 'critical').length;
}

function narrativeClusterApprox(): number {
  const items = getEchoEpicon();
  return items.filter((e) => e.category === 'narrative').length;
}

export async function buildEveGovernanceSynthesisInput(options?: {
  externalItemCount?: number;
  externalDegradedReason?: string;
}): Promise<EveSynthesisInput> {
  const cycleId = currentCycleId();
  const timestamp = nowIso();
  const ledgerRows = await readLedgerRows(320);

  const committedAgentRows = ledgerRows.filter(
    (row) => row.source === 'agent_commit' && row.status === 'committed' && row.cycle === cycleId,
  );

  const agentAuthors = [
    ...new Set(
      committedAgentRows
        .map((row) => row.agentOrigin ?? row.author)
        .filter((a): a is string => typeof a === 'string' && a.trim().length > 0),
    ),
  ].sort();

  const tripwire = getTripwireState();
  const echoAlerts = getEchoAlerts();
  const civicAlerts = echoAlerts.length > 0 ? echoAlerts : mockCivicAlerts;

  let treasuryStatus = 'unavailable';
  let treasuryTripwireCount = 0;
  let treasuryAlertCount = 0;
  let treasuryDegraded = true;
  try {
    const treasury = await getTreasuryAlerts();
    treasuryStatus = treasury.status;
    treasuryTripwireCount = treasury.tripwires.length;
    treasuryAlertCount = treasury.alerts.length;
    treasuryDegraded = false;
  } catch {
    treasuryDegraded = true;
  }

  const gi = integrityStatus.global_integrity;
  const mii = integrityStatus.mii_baseline;
  const extCount = typeof options?.externalItemCount === 'number' ? options.externalItemCount : 0;
  const extReason = options?.externalDegradedReason;

  return {
    cycleId,
    timestamp,
    committedAgentRows,
    agentAuthors,
    tripwire,
    civicAlerts,
    treasury: {
      status: treasuryStatus,
      tripwireCount: treasuryTripwireCount,
      alertCount: treasuryAlertCount,
      degraded: treasuryDegraded,
    },
    gi,
    mii,
    narrativeClusterCount: narrativeClusterApprox(),
    externalEnrichment: {
      available: extCount > 0,
      itemCount: extCount,
      degradedReason: extReason,
    },
  };
}

function ruleBasedSynthesis(input: EveSynthesisInput): EveGovernanceSynthesisOutput {
  const { cycleId, committedAgentRows, agentAuthors, tripwire, civicAlerts, treasury, gi, mii, narrativeClusterCount, externalEnrichment } =
    input;

  const giSev = scoreToSeverity(gi);
  const miiSev = scoreToSeverity(mii);
  const twSev = tripwireToSeverity(tripwire.level);
  const civicCritical = countCriticalCivic(civicAlerts);
  const civicSev: Severity = civicCritical >= CIVIC_CRITICAL_ESCALATION ? 'high' : civicAlerts.length >= 4 ? 'medium' : 'low';
  const treasurySev: Severity =
    treasury.status === 'critical' || treasury.status === 'stressed'
      ? 'high'
      : treasury.status === 'watch'
        ? 'medium'
        : 'low';

  const narrativeSev: Severity = narrativeClusterCount >= NARRATIVE_CLUSTER_ESCALATION ? 'medium' : 'low';

  const combinedSeverity = [giSev, miiSev, twSev, civicSev, treasurySev, narrativeSev].reduce((a, b) => maxSeverity(a, b));

  const agentLine =
    agentAuthors.length > 0
      ? `Committed agent lanes this cycle: ${agentAuthors.join(', ')}.`
      : 'No additional committed agent authors detected for this cycle window yet.';

  const treasuryLine = treasury.degraded
    ? 'Treasury watch: degraded — internal fiscal stress signals were not refreshed; posture inferred from other substrate lanes only.'
    : `Treasury watch: ${treasury.status} (${treasury.tripwireCount} fiscal tripwire(s), ${treasury.alertCount} alert(s)).`;

  const tripLine = tripwire.active
    ? `Runtime tripwire active (${tripwire.level}) — ${tripwire.reason}`
    : `Runtime tripwire: ${tripwire.level} — ${tripwire.reason}`;

  const extLine = externalEnrichment.available
    ? `External observation layer: ${externalEnrichment.itemCount} fresh item(s) available for enrichment.`
    : externalEnrichment.degradedReason
      ? `External observation layer: degraded (${externalEnrichment.degradedReason}).`
      : 'External observation layer: unavailable or stale — synthesis remains substrate-first.';

  const narrativeLine =
    narrativeClusterCount >= NARRATIVE_CLUSTER_ESCALATION
      ? `Narrative cluster pressure: ${narrativeClusterCount} narrative-class EPICON signals in ECHO — monitor for amplification beyond verified evidence.`
      : `Narrative cluster pressure: ${narrativeClusterCount} narrative-class signals — within normal watch band.`;

  const summary = sanitizeTitle(
    `GI ${gi.toFixed(2)}, MII ${mii.toFixed(2)}; ${committedAgentRows.length} committed agent row(s); civic radar ${civicAlerts.length} alert(s); ${tripLine.slice(0, 80)}${tripLine.length > 80 ? '…' : ''}`,
  );

  const title = sanitizeTitle(
    combinedSeverity === 'high' || tripwire.active
      ? `EVE review: civic-risk elevated — verify before narrative expansion (${cycleId})`
      : gi < GI_ESCALATION_THRESHOLD
        ? `EVE review: integrity posture soft — tighten verification cadence (${cycleId})`
        : `EVE review: governance substrate stable with active cross-lane memory (${cycleId})`,
  );

  const body = [
    `${agentLine} ${treasuryLine}`,
    `${tripLine}. Civic radar: ${civicAlerts.length} alert(s), including ${civicCritical} critical-class signal(s).`,
    `${narrativeLine}`,
    `${extLine}`,
    'Ethics framing: privilege committed ledger and verification chains over synthetic certainty; flag overreach when narrative velocity exceeds corroborated evidence.',
  ].join('\n\n');

  const governancePosture: EveGovernanceSynthesisOutput['governancePosture'] =
    combinedSeverity === 'high' || tripwire.active ? 'stressed' : combinedSeverity === 'medium' ? 'watch' : 'stable';

  const civicRiskLevel: EveGovernanceSynthesisOutput['civicRiskLevel'] =
    civicCritical >= 1 || combinedSeverity === 'high' ? 'high' : combinedSeverity === 'medium' ? 'medium' : 'low';

  const ethicsFlags: string[] = [];
  if (tripwire.active) ethicsFlags.push('active_tripwire');
  if (narrativeClusterCount >= NARRATIVE_CLUSTER_ESCALATION) ethicsFlags.push('narrative_cluster_elevated');
  if (gi < GI_ESCALATION_THRESHOLD) ethicsFlags.push('gi_below_watch');
  if (treasury.status === 'stressed' || treasury.status === 'critical') ethicsFlags.push('fiscal_stress');
  if (!externalEnrichment.available) ethicsFlags.push('external_layer_degraded');

  const derivedFrom: string[] = [];
  for (const row of committedAgentRows.slice(0, 12)) {
    derivedFrom.push(row.id);
  }
  derivedFrom.push(`tripwire:${tripwire.level}`);
  for (const a of civicAlerts.slice(0, 6)) {
    derivedFrom.push(`civic:${a.id}`);
  }
  if (treasury.tripwireCount > 0) derivedFrom.push('treasury:tripwires');
  if (treasury.alertCount > 0) derivedFrom.push('treasury:alerts');

  const category: NewsCategory =
    civicRiskLevel === 'high' || civicCritical >= 1 ? 'civic-risk' : ethicsFlags.includes('narrative_cluster_elevated') ? 'ethics' : 'governance';

  const confidenceTier: EveGovernanceSynthesisOutput['confidenceTier'] = combinedSeverity === 'high' ? 2 : 3;

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

function hasCycleSynthesisForWindow(rows: EpiconLedgerFeedEntry[], cycleId: string): boolean {
  return rows.some(
    (row) =>
      row.source === 'eve-synthesis' &&
      row.agentOrigin === 'EVE' &&
      row.cycle === cycleId &&
      row.tags.includes(EVE_GOVERNANCE_TAG),
  );
}

function hasLedgerEntryById(rows: EpiconLedgerFeedEntry[], id: string): boolean {
  return rows.some((row) => row.id === id);
}

function escalationActive(input: EveSynthesisInput): boolean {
  if (input.gi < GI_ESCALATION_THRESHOLD) return true;
  if (input.tripwire.active || input.tripwire.level === 'elevated' || input.tripwire.level === 'high' || input.tripwire.level === 'triggered') {
    return true;
  }
  if (countCriticalCivic(input.civicAlerts) >= CIVIC_CRITICAL_ESCALATION) return true;
  if (input.narrativeClusterCount >= NARRATIVE_CLUSTER_ESCALATION) return true;
  if (input.treasury.status === 'stressed' || input.treasury.status === 'critical') return true;
  return false;
}

function escalationSignature(input: EveSynthesisInput): string {
  const crit = countCriticalCivic(input.civicAlerts);
  return [
    input.cycleId,
    input.gi.toFixed(3),
    input.tripwire.level,
    input.tripwire.active ? '1' : '0',
    String(crit),
    String(input.narrativeClusterCount),
    input.treasury.status,
  ].join('|');
}

function tokenFromSignature(sig: string): string {
  let h = 0;
  for (let i = 0; i < sig.length; i++) {
    h = (Math.imul(31, h) + sig.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).toUpperCase().slice(0, 8);
}

async function kvLastCyclePublished(): Promise<string | null> {
  const v = await kvGet<string>(KV_LAST_CYCLE);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function kvSetLastCyclePublished(cycleId: string): Promise<void> {
  memoryLastCyclePublished = cycleId;
  await kvSet(KV_LAST_CYCLE, cycleId);
}

async function kvLastEscalationSig(): Promise<string | null> {
  const v = await kvGet<string>(KV_LAST_ESCAL_SIG);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function kvSetLastEscalationSig(sig: string): Promise<void> {
  memoryLastEscalationSig = sig;
  await kvSet(KV_LAST_ESCAL_SIG, sig, ESCALATION_SIG_TTL_SEC);
}

export async function runEveGovernanceSynthesis(options?: {
  mode?: EveGovernanceRunMode;
  externalItemCount?: number;
  externalDegradedReason?: string;
}): Promise<EveGovernanceSynthesisResult> {
  const input = await buildEveGovernanceSynthesisInput({
    externalItemCount: options?.externalItemCount,
    externalDegradedReason: options?.externalDegradedReason,
  });
  const { cycleId } = input;
  const ledgerRows = await readLedgerRows(400);
  const mode: EveGovernanceRunMode = options?.mode ?? 'cycle';

  if (mode === 'cycle') {
    if (memoryLastCyclePublished === cycleId) {
      return {
        ok: true,
        cycleId,
        mode: 'cycle',
        published: false,
        entryId: ledgerIdCycle(cycleId),
        reason: 'already_synthesized_for_window',
        derivedFromCount: 0,
        synthesis: null,
        input,
      };
    }

    const kvCycle = await kvLastCyclePublished();
    if (kvCycle === cycleId) {
      memoryLastCyclePublished = cycleId;
      return {
        ok: true,
        cycleId,
        mode: 'cycle',
        published: false,
        entryId: ledgerIdCycle(cycleId),
        reason: 'already_synthesized_for_window',
        derivedFromCount: 0,
        synthesis: null,
        input,
      };
    }

    if (hasCycleSynthesisForWindow(ledgerRows, cycleId)) {
      memoryLastCyclePublished = cycleId;
      await kvSetLastCyclePublished(cycleId);
      return {
        ok: true,
        cycleId,
        mode: 'cycle',
        published: false,
        entryId: ledgerIdCycle(cycleId),
        reason: 'already_synthesized_for_window',
        derivedFromCount: 0,
        synthesis: null,
        input,
      };
    }

    const existingLegacy = ledgerRows.find(
      (r) => r.author === 'EVE' && r.cycle === cycleId && r.tags.includes('eve-internal-synthesis'),
    );
    if (existingLegacy) {
      memoryLastCyclePublished = cycleId;
      await kvSetLastCyclePublished(cycleId);
      return {
        ok: true,
        cycleId,
        mode: 'cycle',
        published: false,
        entryId: existingLegacy.id,
        reason: 'legacy_internal_synthesis_present',
        derivedFromCount: 0,
        synthesis: null,
        input,
      };
    }

    const synth = ruleBasedSynthesis(input);
    const entryId = ledgerIdCycle(cycleId);

    if (hasLedgerEntryById(ledgerRows, entryId)) {
      memoryLastCyclePublished = cycleId;
      await kvSetLastCyclePublished(cycleId);
      return {
        ok: true,
        cycleId,
        mode: 'cycle',
        published: false,
        entryId,
        reason: 'already_synthesized_for_window',
        derivedFromCount: synth.derivedFrom.length,
        synthesis: synth,
        input,
      };
    }

    await pushLedgerEntry({
      id: entryId,
      timestamp: input.timestamp,
      author: 'EVE',
      title: synth.title,
      body: synth.body,
      type: 'epicon',
      severity: synth.severity,
      tags: [EVE_GOVERNANCE_TAG, EVE_GOVERNANCE_VERSION, synth.category, ...synth.ethicsFlags.slice(0, 6)],
      source: 'eve-synthesis',
      verified: true,
      verifiedBy: 'ZEUS',
      cycle: cycleId,
      category: synth.category === 'civic-risk' ? 'governance' : synth.category,
      confidenceTier: synth.confidenceTier,
      status: 'committed',
      agentOrigin: 'EVE',
      derivedFrom: synth.derivedFrom.slice(0, 24).join(','),
    });

    await kvSetLastCyclePublished(cycleId);

    return {
      ok: true,
      cycleId,
      mode: 'cycle',
      published: true,
      entryId,
      reason: 'cycle_window_due',
      derivedFromCount: synth.derivedFrom.length,
      synthesis: synth,
      input,
    };
  }

  // escalation mode
  if (!escalationActive(input)) {
    return {
      ok: true,
      cycleId,
      mode: 'escalation',
      published: false,
      entryId: null,
      reason: 'no_escalation_conditions',
      derivedFromCount: 0,
      synthesis: null,
      input,
    };
  }

  const sig = escalationSignature(input);
  if (memoryLastEscalationSig === sig) {
    return {
      ok: true,
      cycleId,
      mode: 'escalation',
      published: false,
      entryId: null,
      reason: 'already_synthesized_for_escalation_signature',
      derivedFromCount: 0,
      synthesis: null,
      input,
    };
  }

  const prevSig = await kvLastEscalationSig();
  if (prevSig === sig) {
    memoryLastEscalationSig = sig;
    return {
      ok: true,
      cycleId,
      mode: 'escalation',
      published: false,
      entryId: null,
      reason: 'already_synthesized_for_escalation_signature',
      derivedFromCount: 0,
      synthesis: null,
      input,
    };
  }

  const token = tokenFromSignature(sig);
  const entryId = ledgerIdEscalation(cycleId, token);
  if (hasLedgerEntryById(ledgerRows, entryId)) {
    await kvSetLastEscalationSig(sig);
    return {
      ok: true,
      cycleId,
      mode: 'escalation',
      published: false,
      entryId,
      reason: 'already_synthesized_for_escalation_signature',
      derivedFromCount: 0,
      synthesis: null,
      input,
    };
  }

  const synth = ruleBasedSynthesis(input);
  const escalTitle = sanitizeTitle(`EVE review: escalation — ${synth.title.replace(/^EVE review:\s*/i, '')}`);

  await pushLedgerEntry({
    id: entryId,
    timestamp: nowIso(),
    author: 'EVE',
    title: escalTitle,
    body: synth.body,
    type: 'epicon',
    severity: maxSeverity(synth.severity, 'medium'),
    tags: [EVE_GOVERNANCE_TAG, EVE_GOVERNANCE_VERSION, 'escalation', synth.category, ...synth.ethicsFlags.slice(0, 5)],
    source: 'eve-synthesis',
    verified: true,
    verifiedBy: 'ZEUS',
    cycle: cycleId,
    category: 'governance',
    confidenceTier: synth.confidenceTier,
    status: 'committed',
    agentOrigin: 'EVE',
    derivedFrom: synth.derivedFrom.slice(0, 24).join(','),
  });

  await kvSetLastEscalationSig(sig);

  return {
    ok: true,
    cycleId,
    mode: 'escalation',
    published: true,
    entryId,
    reason: 'escalation_conditions_met',
    derivedFromCount: synth.derivedFrom.length,
    synthesis: { ...synth, title: escalTitle },
    input,
  };
}

/** Backward-compatible hook for GET /api/eve/global-news — refreshes ledger once per cycle and returns panel items. */
export async function buildAndCommitEveInternalSynthesis(options?: {
  externalItemCount?: number;
  externalDegradedReason?: string;
}): Promise<{
  cycleId: string;
  items: EveNewsItem[];
  pattern_notes: string[];
  dominant_category: NewsCategory;
  dominant_region: string;
  global_tension: EveSynthesis['global_tension'];
  committed: boolean;
}> {
  const result = await runEveGovernanceSynthesis({
    mode: 'cycle',
    externalItemCount: options?.externalItemCount,
    externalDegradedReason: options?.externalDegradedReason,
  });
  const input = result.input;
  const synth = result.synthesis ?? ruleBasedSynthesis(input);

  const giSeverity = scoreToSeverity(input.gi);
  const miiSeverity = scoreToSeverity(input.mii);
  const tripwireSeverity = tripwireToSeverity(input.tripwire.level);
  const combinedSeverity = maxSeverity(maxSeverity(giSeverity, miiSeverity), tripwireSeverity);

  const tensionFromHighest = (h: Severity): EveSynthesis['global_tension'] => {
    if (h === 'high') return 'high';
    if (h === 'medium') return 'elevated';
    return 'moderate';
  };

  const governanceSummaryTitle = sanitizeTitle(
    `EVE review: governance posture for ${input.cycleId} across committed agent lanes`,
  );
  const governanceSummary =
    `Cycle ${input.cycleId} has ${input.committedAgentRows.length} committed agent rows ` +
    `from ${input.agentAuthors.length > 0 ? input.agentAuthors.join(', ') : 'no active agent authors yet'}. ` +
    `GI=${input.gi.toFixed(2)}, MII=${input.mii.toFixed(2)}, treasury=${input.treasury.status}.`;

  const publicRiskTitle = sanitizeTitle(`EVE framing: civic-risk transmission watch for ${input.cycleId}`);
  const publicRisk =
    `Public-risk framing: civic radar is carrying ${input.civicAlerts.length} alert(s), ` +
    `treasury watch reports ${input.treasury.tripwireCount} tripwire(s) and ${input.treasury.alertCount} alert(s), ` +
    `and tripwire posture is ${input.tripwire.level}.`;

  const cautionTitle = sanitizeTitle(`EVE caution: operator integrity posture note for ${input.cycleId}`);
  const caution =
    input.tripwire.active
      ? `Operator caution: active tripwire (${input.tripwire.level}) — ${input.tripwire.reason}. Keep narrative claims subordinate to committed ledger evidence.`
      : 'Operator caution: no active runtime tripwire, but preserve verification discipline and avoid narrative overreach.';

  const timestamp = input.timestamp;
  const items: EveNewsItem[] = [
    {
      id: `eve-internal-${input.cycleId.toLowerCase()}-governance`,
      title: governanceSummaryTitle,
      summary: governanceSummary,
      url: '/api/epicon/feed',
      source: 'EVE Internal Substrate',
      region: 'System',
      timestamp,
      category: 'governance',
      severity: combinedSeverity,
      eve_tag: 'Internal governance synthesis from committed substrate state',
    },
    {
      id: `eve-internal-${input.cycleId.toLowerCase()}-civic-risk`,
      title: publicRiskTitle,
      summary: publicRisk,
      url: '/api/echo/feed',
      source: 'EVE Civic Radar',
      region: 'Public Sphere',
      timestamp,
      category: 'civic-risk',
      severity: maxSeverity(combinedSeverity, input.civicAlerts.length >= 3 ? 'medium' : 'low'),
      eve_tag: 'Public-risk framing from civic radar and treasury watch',
    },
    {
      id: `eve-internal-${input.cycleId.toLowerCase()}-ethics`,
      title: cautionTitle,
      summary: caution,
      url: '/api/tripwire/status',
      source: 'EVE Integrity Posture',
      region: 'Operator',
      timestamp,
      category: 'ethics',
      severity: tripwireSeverity,
      eve_tag: 'Operator caution memo for integrity-preserving execution',
    },
  ];

  const pattern_notes = [
    synth.summary,
    `Tripwire posture ${input.tripwire.level}; treasury ${input.treasury.status}; civic radar alerts ${input.civicAlerts.length}.`,
    `EVE lane: ${result.published ? `committed ledger entry ${result.entryId ?? ''}` : 'ledger idempotent hold — no duplicate publish'}.`,
  ];

  const counts = new Map<NewsCategory, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  const dominant_category = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'governance';

  return {
    cycleId: input.cycleId,
    items,
    pattern_notes,
    dominant_category,
    dominant_region: 'System',
    global_tension: tensionFromHighest(combinedSeverity),
    committed: result.published,
  };
}

