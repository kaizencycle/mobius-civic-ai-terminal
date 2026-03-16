/**
 * ECHO Ingest API Route
 *
 * GET  /api/echo/ingest — Check ingest status
 * POST /api/echo/ingest — Trigger a new ingest cycle (called by Vercel Cron)
 *
 * Vercel Cron hits this endpoint every 2 hours.
 * Can also be triggered manually: curl -X POST /api/echo/ingest
 */

import { NextResponse } from 'next/server';
import { fetchAllSources } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { pushIngestResult, getEchoStatus } from '@/lib/echo/store';

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
