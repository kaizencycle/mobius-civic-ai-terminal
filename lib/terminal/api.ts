import type { Agent, EpiconItem, GISnapshot, Tripwire, LedgerEntry, CivicRadarAlert } from './types';
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';
import type { MobiusCivicIntegritySignal } from '@/lib/integrity-signal';
import { ledgerBackfill, type LedgerBackfillEntry } from '@/lib/mock/ledgerBackfill';
import { integrityStatus, type IntegrityStatusResponse } from '@/lib/mock/integrityStatus';
import { mockAgents, mockEpicon, mockTripwires } from './mock';
import { transformAgent, transformEpicon, transformTripwire } from './transforms';

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE
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
    cat === 'narrative'
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
  const source: LedgerEntry['source'] | undefined =
    src === 'eve-synthesis' || src === 'echo' || src === 'backfill' || src === 'mock'
      ? src
      : undefined;

  return {
    id,
    cycleId,
    type: 'epicon',
    agentOrigin: author,
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
  const raw = await fetchJson('/agents/status');
  if (!raw) return mockAgents;
  const agents = raw.agents;
  if (!Array.isArray(agents)) return mockAgents;
  return agents.map(transformAgent);
}

export type EpiconFeedBundle = {
  epicon: EpiconItem[];
  ledgerRows: LedgerEntry[];
};

export async function getEpiconFeed(): Promise<EpiconFeedBundle> {
  const raw = API_BASE
    ? await fetchJson('/epicon/feed')
    : await fetchInternalJson('/api/epicon/feed');
  if (!raw || typeof raw !== 'object') {
    return { epicon: mockEpicon, ledgerRows: [] };
  }
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) {
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
  const raw = await fetchInternalJson('/api/integrity-status');
  if (!raw || typeof raw !== 'object' || !(raw as Record<string, unknown>).ok) return integrityStatus;
  return raw as IntegrityStatusResponse;
}

export async function getGISnapshot(): Promise<GISnapshot> {
  const status = await getIntegrityStatus();
  return integrityStatusToGISnapshot(status);
}

export async function getTripwires(): Promise<Tripwire[]> {
  const raw = await fetchJson('/tripwires/active');
  if (!ra|) return mockTripwires;
  const tripwires = raw.tripwires;
  if (!Array.isArray(tripwires)) return mockTripwires;
  return tripwires.map(transformTripwire);
}

export async function getLedgerBackfill(): Promise<LedgerEntry[]> {
  const raw = await fetchInternalJson('/api/ledger/backfill');
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)
    ? (raw as { items: LedgerBackfillEntry[] }).items
    : ledgerBackfill;

  return items.map(backfillEntryToLedger);
}

// ── ECHO Live Feed ───────────────────────────────────────────

export type EchoFeedData = {
  epicon: EpiconItem[];
  ledger: LedgerEntry[];
  alerts: CivicRadarAlert[];
  integrity: CycleIntegritySummary | null;
  status: {
    lastIngest: string | null;
    cycleId: string;
    totalIngested: number;
    counts: { epicon: number; ledger: number; alerts: number };
  };
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
