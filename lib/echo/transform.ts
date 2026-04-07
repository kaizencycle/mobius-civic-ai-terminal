/**
 * ECHO Transform Layer
 *
 * Converts raw API events into EPICON items and ledger entries
 * that the terminal can display natively.
 */

import type { EpiconItem, LedgerEntry, CivicRadarAlert } from '@/lib/terminal/types';
import type { RawEvent } from './sources';
import { rateBatch, type CycleIntegritySummary } from './integrity-engine';
import { cycleForDate } from '@/lib/eve/cycle-engine';

// ── Cycle tracking ───────────────────────────────────────────
// Initialized from epoch on first call, then kept in sync by EVE-bot.

let cycleCounter = cycleForDate(new Date());
let eventCounter = 100;

export function getCurrentCycleId(): string {
  return `C-${cycleCounter}`;
}

export function advanceCycle(): string {
  cycleCounter += 1;
  eventCounter = 0;
  return getCurrentCycleId();
}

/**
 * Sync the cycle counter to the epoch-calculated value.
 * Called by EVE-bot on cycle transition and on cold starts.
 * Returns the new cycle ID.
 */
export function syncCycleToEpoch(date: Date = new Date()): string {
  cycleCounter = cycleForDate(date);
  eventCounter = 0;
  return getCurrentCycleId();
}

function nextEventId(): string {
  eventCounter += 1;
  return `EPICON-C${cycleCounter}-${String(eventCounter).padStart(3, '0')}`;
}

function nextLedgerId(): string {
  return `LE-C${cycleCounter}-${String(eventCounter + 100).padStart(3, '0')}`;
}

// ── Confidence mapping ───────────────────────────────────────

function severityToConfidence(severity: RawEvent['severity']): 0 | 1 | 2 | 3 | 4 {
  switch (severity) {
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
  }
}

function sourceToAgent(source: string): string {
  switch (source) {
    case 'GDELT': return 'HERMES';
    case 'USGS': return 'ATLAS';
    case 'CoinGecko': return 'HERMES';
    default: return 'ECHO';
  }
}

// ── Timestamp formatting ─────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}-${day} ${hours}:${mins} UTC`;
}

// ── Transform: RawEvent → EpiconItem ─────────────────────────

export function toEpiconItem(raw: RawEvent): EpiconItem {
  const id = nextEventId();
  const agent = sourceToAgent(raw.source);

  return {
    id,
    title: raw.title,
    category: raw.category,
    status: raw.severity === 'high' ? 'pending' : 'verified',
    confidenceTier: severityToConfidence(raw.severity),
    ownerAgent: agent,
    timestamp: formatTimestamp(raw.timestamp),
    sources: [raw.source, ...(raw.url ? [new URL(raw.url).hostname] : [])],
    summary: raw.summary,
    echoIngest: {
      source: raw.source,
      severity: raw.severity,
      metadata: raw.metadata,
    },
    trace: [
      `ECHO captured signal from ${raw.source}`,
      `${agent} classified as ${raw.category}`,
      `ZEUS assigned confidence T${severityToConfidence(raw.severity)}`,
      raw.severity === 'high'
        ? 'ATLAS flagged for priority review'
        : 'ATLAS updated integrity context',
    ],
  };
}

// ── Transform: RawEvent → LedgerEntry ────────────────────────

export function toLedgerEntry(raw: RawEvent, epiconId: string): LedgerEntry {
  const agent = sourceToAgent(raw.source);
  const delta =
    raw.severity === 'high' ? -0.01 : raw.severity === 'medium' ? 0.005 : 0.01;

  return {
    id: nextLedgerId(),
    cycleId: getCurrentCycleId(),
    type: 'epicon',
    agentOrigin: 'ECHO',
    timestamp: formatTimestamp(raw.timestamp),
    title: raw.title,
    summary: `${epiconId} ingested from ${raw.source} via ${agent}.`,
    integrityDelta: delta,
    status: raw.severity === 'high' ? 'pending' : 'committed',
    category: raw.category,
    confidenceTier: severityToConfidence(raw.severity),
    source: 'echo',
  };
}

// ── Transform: RawEvent → CivicRadarAlert (high severity) ────

export function toAlert(raw: RawEvent): CivicRadarAlert | null {
  if (raw.severity !== 'high') return null;

  return {
    id: `CRA-ECHO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: raw.title,
    severity: 'high',
    category: raw.category === 'geopolitical' ? 'misinformation'
      : raw.category === 'infrastructure' ? 'infrastructure'
      : raw.category === 'market' ? 'manipulation'
      : 'governance',
    source: `ECHO ${raw.source} Monitor`,
    timestamp: formatTimestamp(raw.timestamp),
    impact: raw.summary,
    actions: [
      `ECHO ingested from ${raw.source}`,
      `${sourceToAgent(raw.source)} flagged for review`,
      'Monitoring velocity for amplification patterns',
    ],
  };
}

// ── Batch transform ──────────────────────────────────────────

export type IngestResult = {
  cycleId: string;
  epicon: EpiconItem[];
  ledger: LedgerEntry[];
  alerts: CivicRadarAlert[];
  integrity: CycleIntegritySummary;
  sourceCount: number;
  duplicateSuppressedCount: number;
  timestamp: string;
};

function isFreshEntry(timestamp: string, maxAgeHours = 48): boolean {
  try {
    const entryTime = new Date(timestamp).getTime();
    if (!Number.isFinite(entryTime)) return false;

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    return entryTime >= cutoff;
  } catch {
    return false; // malformed timestamp — reject silently
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function deriveRawEventFingerprint(event: RawEvent): string {
  const bucketMinutes = 10;
  const time = new Date(event.timestamp).getTime();
  const bucket = Number.isFinite(time) ? Math.floor(time / (bucketMinutes * 60 * 1000)) : event.timestamp;
  const symbol = typeof event.metadata?.coin === 'string' ? event.metadata.coin.toLowerCase() : '';
  return [
    event.source.toLowerCase(),
    event.category,
    symbol,
    bucket,
    normalizeText(event.title),
    normalizeText(event.summary),
  ].join('|');
}

export function transformBatch(events: RawEvent[]): IngestResult {
  const freshEvents = events.filter((event) => isFreshEntry(event.timestamp));
  const dedupedEvents: RawEvent[] = [];
  const seenFingerprints = new Set<string>();
  let duplicateSuppressedCount = 0;

  for (const event of freshEvents) {
    const fingerprint = deriveRawEventFingerprint(event);
    if (seenFingerprints.has(fingerprint)) {
      duplicateSuppressedCount += 1;
      continue;
    }
    seenFingerprints.add(fingerprint);
    dedupedEvents.push(event);
  }

  const epicon: EpiconItem[] = [];
  const ledger: LedgerEntry[] = [];
  const alerts: CivicRadarAlert[] = [];

  for (const raw of dedupedEvents) {
    const item = toEpiconItem(raw);
    epicon.push(item);
    ledger.push(toLedgerEntry(raw, item.id));

    const alert = toAlert(raw);
    if (alert) alerts.push(alert);
  }

  // Run integrity rating across all agents (ATLAS, ZEUS, JADE, EVE)
  const cycleId = getCurrentCycleId();
  const integrity = rateBatch(dedupedEvents, epicon, cycleId);

  // Update ledger deltas with integrity-engine-computed values
  for (let i = 0; i < ledger.length; i++) {
    const rating = integrity.ratings[i];
    if (rating) {
      ledger[i].integrityDelta = rating.integrityDelta;
      ledger[i].status = rating.verdict === 'contested' ? 'pending'
        : rating.verdict === 'flagged' ? 'pending'
        : 'committed';
    }
  }

  // Update EPICON statuses based on integrity verdicts
  for (let i = 0; i < epicon.length; i++) {
    const rating = integrity.ratings[i];
    if (rating) {
      epicon[i].status = rating.verdict === 'contested' ? 'contradicted'
        : rating.verdict === 'flagged' ? 'pending'
        : 'verified';
    }
  }

  return {
    cycleId,
    epicon,
    ledger,
    alerts,
    integrity,
    sourceCount: dedupedEvents.length,
    duplicateSuppressedCount,
    timestamp: new Date().toISOString(),
  };
}
