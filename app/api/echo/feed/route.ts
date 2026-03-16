/**
 * ECHO Feed API Route
 *
 * GET /api/echo/feed — Returns live EPICON events, ledger entries, and alerts
 *
 * The frontend polls this to merge live ECHO data with mock data.
 * If the store is empty (cold start), triggers an ingest first.
 */

import { NextResponse } from 'next/server';
import { getEchoEpicon, getEchoLedger, getEchoAlerts, getEchoStatus, pushIngestResult } from '@/lib/echo/store';
import { fetchAllSources } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getEchoStatus();

  // If store is empty, do a lazy ingest (first request warms the cache)
  if (status.totalIngested === 0) {
    try {
      const rawEvents = await fetchAllSources();
      if (rawEvents.length > 0) {
        const result = transformBatch(rawEvents);
        pushIngestResult(result);
      }
    } catch {
      // Proceed with empty data
    }
  }

  return NextResponse.json({
    epicon: getEchoEpicon(),
    ledger: getEchoLedger(),
    alerts: getEchoAlerts(),
    status: getEchoStatus(),
  });
}
