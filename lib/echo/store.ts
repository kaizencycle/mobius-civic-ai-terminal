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
};

// Module-level singleton — survives across requests in a warm serverless instance
const store: EchoStore = {
  epicon: [],
  ledger: [],
  alerts: [],
  integrity: null,
  lastIngest: null,
  cycleId: 'C-250',
  totalIngested: 0,
};

export function pushIngestResult(result: IngestResult): void {
  // Prepend new items, cap at max
  store.epicon = [...result.epicon, ...store.epicon].slice(0, MAX_EPICON);
  store.ledger = [...result.ledger, ...store.ledger].slice(0, MAX_LEDGER);
  store.alerts = [...result.alerts, ...store.alerts].slice(0, MAX_ALERTS);
  store.integrity = result.integrity;
  store.lastIngest = result.timestamp;
  store.cycleId = result.cycleId;
  store.totalIngested += result.sourceCount;
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
} {
  return {
    lastIngest: store.lastIngest,
    cycleId: store.cycleId,
    totalIngested: store.totalIngested,
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
}
