/**
 * ECHO Snapshot Writer
 *
 * Writes docs/echo/ files from current store state.
 * Used by the ingest route and snapshot API route.
 *
 * Returns true if files were written, false if filesystem is read-only.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { EpiconItem, LedgerEntry, CivicRadarAlert } from '@/lib/terminal/types';
import {
  buildSnapshot,
  buildEvent,
  buildDashboard,
  appendToTimeline,
  appendToEventLog,
  type EchoTimeline,
  type EchoEventLog,
} from './ledger-writer';

const DOCS_ROOT = path.join(process.cwd(), 'docs', 'echo');
const HISTORY_DIR = path.join(DOCS_ROOT, 'history');

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function tsFileName(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') + '.json';
}

export async function writeSnapshot(
  status: { cycleId: string; totalIngested: number },
  epicon: EpiconItem[],
  ledger: LedgerEntry[],
  alerts: CivicRadarAlert[],
): Promise<boolean> {
  if (status.totalIngested === 0) return false;

  const now = new Date().toISOString();
  const snapshot = buildSnapshot(status.cycleId, epicon, ledger, alerts, now);
  const event = buildEvent(
    status.cycleId,
    status.totalIngested,
    epicon.length,
    ledger.length,
    alerts.length,
    now,
  );
  const dashboard = buildDashboard(snapshot);

  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });

    // data.json — current snapshot
    await fs.writeFile(
      path.join(DOCS_ROOT, 'data.json'),
      JSON.stringify(snapshot, null, 2) + '\n',
    );

    // dashboard.md
    await fs.writeFile(path.join(DOCS_ROOT, 'dashboard.md'), dashboard);

    // history/{timestamp}.json
    await fs.writeFile(
      path.join(HISTORY_DIR, tsFileName(now)),
      JSON.stringify(snapshot, null, 2) + '\n',
    );

    // history/index.json — timeline
    const existingTimeline = await readJsonSafe<EchoTimeline>(
      path.join(HISTORY_DIR, 'index.json'),
    );
    const timeline = appendToTimeline(existingTimeline, snapshot);
    await fs.writeFile(
      path.join(HISTORY_DIR, 'index.json'),
      JSON.stringify(timeline, null, 2) + '\n',
    );

    // history/events.json — event log
    const existingEvents = await readJsonSafe<EchoEventLog>(
      path.join(HISTORY_DIR, 'events.json'),
    );
    const eventLog = appendToEventLog(existingEvents, event);
    await fs.writeFile(
      path.join(HISTORY_DIR, 'events.json'),
      JSON.stringify(eventLog, null, 2) + '\n',
    );

    return true;
  } catch {
    return false;
  }
}
