/**
 * ECHO Ingest API Route
 *
 * GET  /api/echo/ingest — Check ingest status
 * POST /api/echo/ingest — Trigger a new ingest cycle (called by Vercel Cron)
 *
 * Vercel Cron hits this endpoint daily at 6 AM UTC.
 * Feed route auto-re-ingests when data is stale (>2h).
 * Can also be triggered manually: curl -X POST /api/echo/ingest
 *
 * After ingest, generates a docs/echo/ snapshot (JSON ledger + dashboard).
 */

import { NextResponse } from 'next/server';
import { fetchAllSources } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { pushIngestResult, getEchoStatus, getEchoEpicon, getEchoLedger, getEchoAlerts } from '@/lib/echo/store';
import { writeSnapshot } from '@/lib/echo/snapshot-writer';
import { saveEchoState } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getEchoStatus();
  return NextResponse.json({
    agent: 'ECHO',
    status: 'operational',
    ...status,
  });
}

export async function POST() {
  const startTime = Date.now();

  try {
    // 1. Fetch from all sources
    const rawEvents = await fetchAllSources();

    if (rawEvents.length === 0) {
      return NextResponse.json({
        agent: 'ECHO',
        action: 'ingest',
        result: 'no_data',
        message: 'All sources returned empty. Will retry next cycle.',
        duration: Date.now() - startTime,
      });
    }

    // 2. Transform to EPICON events + ledger entries
    const result = transformBatch(rawEvents);

    // 3. Push to store
    pushIngestResult(result);
    const status = getEchoStatus();
    const dedupDenominator = Math.max(1, status.totalIngested + status.duplicateSuppressedCount);
    const dedupRate = Number((status.duplicateSuppressedCount / dedupDenominator).toFixed(3));
    await saveEchoState({
      lastIngest: status.lastIngest,
      cycleId: status.cycleId,
      totalIngested: status.totalIngested,
      epiconCount: status.counts.epicon,
      ledgerCount: status.counts.ledger,
      alertCount: status.counts.alerts,
      timestamp: new Date().toISOString(),
      dedupRate,
    }).catch(() => {});

    // 4. Generate docs/echo/ snapshot (fire-and-forget, non-blocking)
    let snapshotWritten = false;
    try {
      snapshotWritten = await writeSnapshot(
        getEchoStatus(),
        getEchoEpicon(),
        getEchoLedger(),
        getEchoAlerts(),
      );
    } catch {
      // Snapshot writing is best-effort
    }

    return NextResponse.json({
      agent: 'ECHO',
      action: 'ingest',
      result: 'ok',
      cycleId: result.cycleId,
      ingested: {
        sources: result.sourceCount,
        epicon: result.epicon.length,
        ledger: result.ledger.length,
        alerts: result.alerts.length,
      },
      snapshot: snapshotWritten ? 'written' : 'skipped',
      duration: Date.now() - startTime,
      timestamp: result.timestamp,
    });
  } catch (error) {
    return NextResponse.json(
      {
        agent: 'ECHO',
        action: 'ingest',
        result: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
