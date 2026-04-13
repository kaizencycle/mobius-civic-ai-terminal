/**
 * ECHO Feed API Route
 *
 * GET /api/echo/feed — Returns live EPICON events, ledger entries, and alerts
 *
 * The frontend polls this to merge live ECHO data with mock data.
 * Re-ingests automatically when data is stale (>2 hours old) or on cold start.
 *
 * This compensates for Vercel Hobby's once-daily cron limit:
 * the cron seeds the morning baseline, and feed requests keep data
 * fresh throughout the day via stale-while-revalidate.
 */

import { NextResponse } from 'next/server';
import { getEchoEpicon, getEchoLedger, getEchoAlerts, getEchoIntegrity, getEchoStatus, pushIngestResult } from '@/lib/echo/store';
import { fetchAllSources } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { persistEchoIngestSideEffects } from '@/lib/echo/kv-persist-ingest';

export const dynamic = 'force-dynamic';

const STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

function isStale(): boolean {
  const { lastIngest } = getEchoStatus();
  if (!lastIngest) return true;
  return Date.now() - new Date(lastIngest).getTime() > STALE_MS;
}

export async function GET() {
  // Re-ingest if store is empty or data is older than 2 hours
  if (isStale()) {
    try {
      const rawEvents = await fetchAllSources();
      if (rawEvents.length > 0) {
        const result = transformBatch(rawEvents);
        pushIngestResult(result);
        await persistEchoIngestSideEffects(result);
      }
    } catch {
      // Proceed with whatever data we have
    }
  }

  return NextResponse.json({
    epicon: getEchoEpicon(),
    ledger: getEchoLedger(),
    alerts: getEchoAlerts(),
    integrity: getEchoIntegrity(),
    status: getEchoStatus(),
  });
}
