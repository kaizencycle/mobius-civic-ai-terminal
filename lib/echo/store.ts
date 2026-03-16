/**
 * ECHO In-Memory Store
 *
 * Holds live EPICON events, ledger entries, and alerts between cron runs.
 * On Vercel serverless, this persists within a warm function instance.
 * On cold starts, the store is empty until the next cron run populates it.
 *
 * For persistent storage across cold starts, connect Vercel KV:
 *   npm i @vercel/kv
 *   Set KV_REST_API_URL and KV_REST_API_TOKEN in env
 */

import type { EpiconItem, LedgerEntry, CivicRadarAlert } from '@/lib/terminal/types';
import type { IngestResult } from './transform';

const MAX_EPICON = 50;
const MAX_LEDGER = 100;
const MAX_ALERTS = 20;

type EchoStore = {
  epicon: EpiconItem[];
  ledger: LedgerEntry[];
  alerts: CivicRadarAlert[];
  lastIngest: string | null;
  cycleId: string;
  totalIngested: number;
};

// Module-level singleton — survives across requests in a warm serverless instance
const store: EchoStore = {
  epicon: [],
  ledger: [],
  alerts: [],
  lastIngest: null,
  cycleId: 'C-250',
  totalIngested: 0,
};

export function pushIngestResult(result: IngestResult): void {
  // Prepend new items, cap at max
  store.epicon = [...result.epicon, ...store.epicon].slice(0, MAX_EPICON);
  store.ledger = [...result.ledger, ...store.ledger].slice(0, MAX_LEDGER);
  store.alerts = [...result.alerts, ...store.alerts].slice(0, MAX_ALERTS);
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
  store.lastIngest = null;
  store.totalIngested = 0;
}
