import type { Agent, EpiconItem, GISnapshot, Tripwire, LedgerEntry, CivicRadarAlert } from './types';
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';
import type { MobiusCivicIntegritySignal } from '@/lib/integrity-signal';
import { ledgerBackfill, type LedgerBackfillEntry } from '@/lib/mock/ledgerBackfill';
import { integrityStatus, type IntegrityStatusResponse } from '@/lib/mock/integrityStatus';
import { mockAgents, mockEpicon, mockTripwires } from './mock';
import { transformAgent, transformEpicon, transformTripwire } from './transforms';

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE ?? process.env.NEXT_PUBLIC_TERMINAL_API_BASE
    : ''
  )?.replace(/\/$/, '') || '';

export const isLiveAPI = !!API_BASE;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(path: string): Promise<any | null> {
  if (!API_BASE) return null;

  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchInternalJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchWithNormalizedFallback(internalPath: string, externalPath?: string): Promise<any | null> {
  const internal = await fetchInternalJson(internalPath);
  if (internal) return internal;
  return fetchJson(externalPath ?? internalPath);
}

export function integrityStatusToGISnapshot(
  status: IntegrityStatusResponse,
  previousScore?: number,
): GISnapshot {
  const quality = status.signals.quality ?? status.signals.geopolitics;
  const freshness = status.signals.freshness ?? status.signals.information;
  const stability = status.signals.stability ?? status.signals.sentiment;
  const system = status.signals.system ?? status.signals.economy;
  const delta = typeof previousScore === 'number'
    ? Number((status.global_integrity - previousScore).toFixed(2))
    : 0;

  return {
    score: status.global_integrity,
    delta,
    mode: status.mode,
    terminalStatus: status.terminal_status,
    primaryDriver: status.primary_driver,
    summary: status.summary,
    institutionalTrust: quality,
    infoReliability: freshness,
    consensusStability: stability,
    signalBreakdown: {
      quality,
      freshness,
      stability,
      system,
    },
    weekly: [
      Math.min(1, Number((status.global_integrity + 0.06).toFixed(2))),
      Math.min(1, Number((status.global_integrity + 0.04).toFixed(2))),
      Math.min(1, Number((status.global_integrity + 0.03).toFixed(2))),
      Math.min(1, Number((status.global_integrity + 0.02).toFixed(2))),
      Math.min(1, Number((status.global_integrity + 0.01).toFixed(2))),
      status.global_integrity,
      status.global_integrity,
    ],
  };
}

function epiconFeedRowToLedger(raw: Record<string, unknown>): LedgerEntry | null {
  if (raw.type !== 'epicon' || raw.verified !== true) return null;
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!id) return null;

  const cycleId =
    typeof raw.cycle === 'string' && raw.cycle.trim() ? raw.cycle.trim() : 'C-0';
  const author = typeof raw.author === 'string' && raw.author.trim() ? raw.author : 'operator';
  const agentLane =
    typeof raw.agentOrigin === 'string' && raw.agentOrigin.trim()
      ? raw.agentOrigin.trim()
      : typeof raw.agent_origin === 'string' && raw.agent_origin.trim()
        ? raw.agent_origin.trim()
        : author;
  const timestamp =
    typeof raw.timestamp === 'string' && raw.timestamp.trim()
      ? raw.timestamp
      : new Date().toISOString();
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title : undefined;
  const body = typeof raw.body === 'string' ? raw.body : '';
  const summary = body.trim() ? body : title ?? '';

  const cat = raw.category;
  const category: LedgerEntry['category'] =
    cat === 'geopolitical' ||
    cat === 'market' ||
    cat === 'governance' ||
    cat === 'infrastructure' ||
    cat === 'narrative' ||
    cat === 'ethics' ||
    cat === 'civic-risk'
      ? cat
      : undefined;

  const ct = raw.confidenceTier;
  const confidenceTier =
    typeof ct === 'number' && Number.isInteger(ct) && ct >= 0 && ct <= 4 ? ct : undefined;

  const tagsRaw = raw.tags;
  const tags =
    Array.isArray(tagsRaw) && tagsRaw.every((t): t is string => typeof t === 'string')
      ? tagsRaw
      : undefined;

  const src = raw.source;
  let source: LedgerEntry['source'] | undefined;
  if (typeof src === 'string') {
    if (src === 'eve-synthesis' || src.startsWith('eve-synthesis')) source = 'eve-synthesis';
    else if (src === 'echo') source = 'echo';
    else if (src === 'backfill') source = 'backfill';
    else if (src === 'mock') source = 'mock';
    else if (src === 'agent_commit') source = 'agent_commit';
  }

  return {
    id,
    cycleId,
    type: 'epicon',
    agentOrigin: agentLane,
    timestamp,
    title,
    summary,
    integrityDelta: 0,
    status: 'committed',
    category,
    confidenceTier,
    tags,
    source,
  };
}



function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function backfillEntryToLedger(entry: LedgerBackfillEntry): LedgerEntry {
  return {
    id: entry.id,
    cycleId: entry.cycle,
    type: 'epicon',
    agentOrigin: entry.agent,
    timestamp: entry.timestamp,
    title: entry.title,
    summary: entry.summary,
    integrityDelta: 0,
    status: entry.status === 'verified' ? 'committed' : entry.status === 'contradicted' ? 'reverted' : 'pending',
    category: entry.category,
    confidenceTier: entry.confidence_tier,
    tags: entry.tags,
    source: 'backfill',
  };
}

export async function getAgents(): Promise<Agent[]> {
  const raw = await fetchWithNormalizedFallback('/api/agents/status', '/agents/status');
  if (!raw || typeof raw !== 'object') return mockAgents;
  const agents = (raw as { agents?: unknown }).agents;
  if (!Array.isArray(agents)) return mockAgents;
  return agents.map((agent) => {
    if (!agent || typeof agent !== 'object') return null;
    const transformed = transformAgent(agent);
    const status = (agent as { status?: unknown }).status;
    const normalizedStatus =
      transformed.status === 'idle' ||
      transformed.status === 'listening' ||
      transformed.status === 'verifying' ||
      transformed.status === 'routing' ||
      transformed.status === 'analyzing' ||
      transformed.status === 'alert'
        ? transformed.status
        : status === 'active'
          ? 'listening'
          : 'idle';
    return { ...transformed, status: normalizedStatus };
  }).filter((agent): agent is Agent => agent !== null);
}

export type EpiconFeedBundle = {
  epicon: EpiconItem[];
  ledgerRows: LedgerEntry[];
};

export async function getEpiconFeed(): Promise<EpiconFeedBundle> {
  const raw = await fetchWithNormalizedFallback('/api/epicon/feed', '/epicon/feed');
  if (!raw || typeof raw !== 'object') {
    return { epicon: mockEpicon, ledgerRows: [] };
  }
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) {
    return { epicon: mockEpicon, ledgerRows: [] };
  }

  const validItems = items.filter(isRecord);

  const epicon = validItems.map(transformEpicon);
  const ledgerRows: LedgerEntry[] = [];
  for (const row of validItems) {
    const entry = epiconFeedRowToLedger(row);
    if (entry) ledgerRows.push(entry);
  }

  return { epicon, ledgerRows };
}

export async function getIntegrityStatus(): Promise<IntegrityStatusResponse> {
  const raw = await fetchWithNormalizedFallback('/api/integrity-status');
  if (!raw || typeof raw !== 'object' || !(raw as Record<string, unknown>).ok) return integrityStatus;
  return raw as IntegrityStatusResponse;
}

export async function getGISnapshot(): Promise<GISnapshot> {
  const status = await getIntegrityStatus();
  return integrityStatusToGISnapshot(status);
}

export async function getTripwires(): Promise<Tripwire[]> {
  const raw = await fetchWithNormalizedFallback('/api/tripwire/status', '/tripwires/active');
  if (!raw || typeof raw !== 'object') return mockTripwires;

  const tripwireStatus = (raw as { tripwire?: unknown }).tripwire;
  if (tripwireStatus && typeof tripwireStatus === 'object') {
    const tripwire = tripwireStatus as Record<string, unknown>;
    const active = Boolean(tripwire.active);
    if (!active) return [];

    const severity = tripwire.level === 'high' || tripwire.level === 'medium' || tripwire.level === 'low'
      ? tripwire.level
      : 'medium';

    return [{
      id: 'runtime-tripwire',
      label: typeof tripwire.reason === 'string' && tripwire.reason ? tripwire.reason : 'Runtime tripwire active',
      severity,
      owner:
        typeof tripwire.triggeredBy === 'string' && tripwire.triggeredBy.trim()
          ? tripwire.triggeredBy
          : 'operator',
      openedAt:
        typeof tripwire.last_updated === 'string' && tripwire.last_updated
          ? tripwire.last_updated
          : new Date().toISOString(),
      action: 'Investigate and keep write lanes constrained until resolved.',
    }];
  }

  const externalTripwires = (raw as { tripwires?: unknown }).tripwires;
  if (Array.isArray(externalTripwires)) return externalTripwires.map(transformTripwire);
  return mockTripwires;
}

export async function getLedgerBackfill(): Promise<LedgerEntry[]> {
  const raw = await fetchInternalJson('/api/ledger/backfill');
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)
    ? (raw as { items: LedgerBackfillEntry[] }).items
    : ledgerBackfill;

  return items.map(backfillEntryToLedger);
}

// ── ECHO Live Feed ────────────────────────────────────────────

export type EchoFeedData = {
  epicon: EpiconItem[];
  ledger: LedgerEntry[];
  alerts: CivicRadarAlert[];
  integrity: CycleIntegritySummary | null;
  status: {
    lastIngest: string | null;
    cycleId: string;
    totalIngested: number;
    duplicateSuppressedCount: number;
    counts: { epicon: number; ledger: number; alerts: number };
  };
};

export type PromotionStatus = {
  counters: {
    pending_promotable_count: number;
    promoted_this_cycle_count: number;
    committed_agent_count: number;
    failed_promotion_count: number;
  };
  diagnostics?: {
    last_promotion_run_at: string | null;
    promoter_input_count: number;
    promoter_eligible_count: number;
    promoter_excluded_reasons: Record<string, number>;
    promoted_ids_this_cycle: string[];
  };
  items?: Array<{
    epicon_id: string;
    promotion_state: 'pending' | 'selected' | 'promoted' | 'failed';
    assigned_agents: string[];
    committed_entries: string[];
    failed_attempts: number;
  }>;
};

/**
 * Fetches live ECHO data from the internal API route.
 * Returns null if the fetch fails (terminal falls back to mock-only data).
 */
export async function getEchoFeed(): Promise<EchoFeedData | null> {
  try {
    const res = await fetch('/api/echo/feed', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getPromotionStatus(): Promise<PromotionStatus | null> {
  const raw = await fetchInternalJson('/api/epicon/promotion-status');
  if (!raw || typeof raw !== 'object') return null;
  const counters = (raw as { counters?: unknown }).counters;
  if (!counters || typeof counters !== 'object') return null;
  return raw as PromotionStatus;
}


export type PulseSnapshot = {
  signals: Array<Record<string, unknown>>;
  integrity_signal: MobiusCivicIntegritySignal | null;
};

export async function getPulseSnapshot(): Promise<PulseSnapshot | null> {
  const raw = await fetchInternalJson('/api/signals/pulse');
  if (!raw || typeof raw !== 'object') return null;

  const rec = raw as Record<string, unknown>;
  const signals = Array.isArray(rec.signals)
    ? rec.signals.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    : [];

  const integritySignal = rec.integrity_signal;
  const typedSignal =
    integritySignal !== null && typeof integritySignal === 'object'
      ? (integritySignal as MobiusCivicIntegritySignal)
      : null;

  return {
    signals,
    integrity_signal: typedSignal,
  };
}
