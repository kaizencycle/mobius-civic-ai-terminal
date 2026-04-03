/**
 * ECHO In-Memory Store
 *
 * Holds live EPICON events, ledger entries, alerts, and integrity ratings
 * between cron runs. On Vercel serverless, this persists within a warm
 * function instance. On cold starts, the store is empty until the next
 * cron run populates it.
 */

import type { EpiconItem, LedgerEntry, CivicRadarAlert } from '@/lib/terminal/types';
import type { IngestResult } from './transform';
import type { CycleIntegritySummary } from './integrity-engine';
import { currentCycleId } from '@/lib/eve/cycle-engine';

const MAX_EPICON = 50;
const MAX_LEDGER = 100;
const MAX_ALERTS = 20;

type EchoStore = {
  epicon: EpiconItem[];
  ledger: LedgerEntry[];
  alerts: CivicRadarAlert[];
  integrity: CycleIntegritySummary | null;
  lastIngest: string | null;
  cycleId: string;
  totalIngested: number;
  duplicateSuppressedCount: number;
};

// Module-level singleton — survives across requests in a warm serverless instance
const store: EchoStore = {
  epicon: [],
  ledger: [],
  alerts: [],
  integrity: null,
  lastIngest: null,
  cycleId: currentCycleId(),
  totalIngested: 0,
  duplicateSuppressedCount: 0,
};

export function pushIngestResult(result: IngestResult): void {
  const epiconSeen = new Set(store.epicon.map((item) => [item.category, item.title, item.timestamp].join('|')));
  const ledgerSeen = new Set(store.ledger.map((row) => [row.source ?? 'unknown', row.category ?? 'unknown', row.title ?? row.summary, row.timestamp, row.status].join('|')));
  const newEpicon: typeof store.epicon = [];
  const newLedger: typeof store.ledger = [];
  let duplicateSuppressed = result.duplicateSuppressedCount;

  for (let i = 0; i < result.epicon.length; i++) {
    const epicon = result.epicon[i];
    const ledger = result.ledger[i];
    if (!epicon || !ledger) continue;

    const epiconKey = [epicon.category, epicon.title, epicon.timestamp].join('|');
    const ledgerKey = [ledger.source ?? 'unknown', ledger.category ?? 'unknown', ledger.title ?? ledger.summary, ledger.timestamp, ledger.status].join('|');
    if (epiconSeen.has(epiconKey) || ledgerSeen.has(ledgerKey)) {
      duplicateSuppressed += 1;
      continue;
    }

    epiconSeen.add(epiconKey);
    ledgerSeen.add(ledgerKey);
    newEpicon.push(epicon);
    newLedger.push(ledger);
  }

  // Prepend deduped items, cap at max
  store.epicon = [...newEpicon, ...store.epicon].slice(0, MAX_EPICON);
  store.ledger = [...newLedger, ...store.ledger].slice(0, MAX_LEDGER);
  store.alerts = [...result.alerts, ...store.alerts].slice(0, MAX_ALERTS);
  store.integrity = result.integrity;
  store.lastIngest = result.timestamp;
  store.cycleId = result.cycleId;
  store.totalIngested += newLedger.length;
  store.duplicateSuppressedCount += duplicateSuppressed;
}

export function getEchoEpicon(): EpiconItem[] {
  return store.epicon;
}

export function getEchoLedger(): LedgerEntry[] {
  return store.ledger;
}

export function getEchoAlerts(): CivicRadarAlert[] {
  return store.alerts;
}

export function getEchoIntegrity(): CycleIntegritySummary | null {
  return store.integrity;
}

export function getEchoStatus(): {
  lastIngest: string | null;
  cycleId: string;
  totalIngested: number;
  counts: { epicon: number; ledger: number; alerts: number };
  duplicateSuppressedCount: number;
} {
  return {
    lastIngest: store.lastIngest,
    cycleId: store.cycleId,
    totalIngested: store.totalIngested,
    duplicateSuppressedCount: store.duplicateSuppressedCount,
    counts: {
      epicon: store.epicon.length,
      ledger: store.ledger.length,
      alerts: store.alerts.length,
    },
  };
}

export function clearStore(): void {
  store.epicon = [];
  store.ledger = [];
  store.alerts = [];
  store.integrity = null;
  store.lastIngest = null;
  store.totalIngested = 0;
  store.duplicateSuppressedCount = 0;
}
