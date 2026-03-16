/**
 * ECHO Snapshot API Route
 *
 * POST /api/echo/snapshot — Generate docs/echo/ snapshot from current store
 * GET  /api/echo/snapshot — Returns the latest snapshot data (read-only)
 *
 * In local/CI environments, writes files to docs/echo/*.
 * Always returns the snapshot payload so external bots can commit it.
 */

import { NextResponse } from 'next/server';
import {
  getEchoEpicon,
  getEchoLedger,
  getEchoAlerts,
  getEchoStatus,
} from '@/lib/echo/store';
import { buildSnapshot, buildDashboard } from '@/lib/echo/ledger-writer';
import { writeSnapshot } from '@/lib/echo/snapshot-writer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getEchoStatus();
  const epicon = getEchoEpicon();
  const ledger = getEchoLedger();
  const alerts = getEchoAlerts();

  if (status.totalIngested === 0) {
    return NextResponse.json({
      agent: 'ECHO',
      action: 'snapshot',
      result: 'empty',
      message: 'No ingest data in store. Trigger an ingest first.',
    });
  }

  const now = new Date().toISOString();
  const snapshot = buildSnapshot(status.cycleId, epicon, ledger, alerts, now);

  return NextResponse.json({
    agent: 'ECHO',
    action: 'snapshot',
    result: 'ok',
    snapshot,
    dashboard: buildDashboard(snapshot),
  });
}

export async function POST() {
  const status = getEchoStatus();
  const epicon = getEchoEpicon();
  const ledger = getEchoLedger();
  const alerts = getEchoAlerts();

  if (status.totalIngested === 0) {
    return NextResponse.json({
      agent: 'ECHO',
      action: 'snapshot',
      result: 'empty',
      message: 'No ingest data in store. Trigger an ingest first.',
    });
  }

  const filesWritten = await writeSnapshot(status, epicon, ledger, alerts);

  const now = new Date().toISOString();
  const snapshot = buildSnapshot(status.cycleId, epicon, ledger, alerts, now);

  return NextResponse.json({
    agent: 'ECHO',
    action: 'snapshot',
    result: 'ok',
    files_written: filesWritten,
    snapshot,
    dashboard_preview: buildDashboard(snapshot).slice(0, 200) + '...',
  });
}
