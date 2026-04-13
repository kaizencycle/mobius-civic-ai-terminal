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
import type { RawEvent } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { pushIngestResult, getEchoStatus, getEchoEpicon, getEchoLedger, getEchoAlerts } from '@/lib/echo/store';
import { writeSnapshot } from '@/lib/echo/snapshot-writer';
import { saveEchoState } from '@/lib/kv/store';
import { querySonarForLane } from '@/lib/signals/perplexity-sonar';
import { persistEchoIngestSideEffects, writeEchoKvHeartbeatToMobius } from '@/lib/echo/kv-persist-ingest';

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

    // 1b. Sonar → EPICON bridge: inject a synthetic governance event when
    // Perplexity Sonar detects relevant civic/governance developments.
    // Uses the 4-hour window cache shared with HERMES-µ — no duplicate API calls.
    if (process.env.PERPLEXITY_API_KEY) {
      try {
        const sonar = await querySonarForLane(
          'HERMES',
          'Recent governance, civic institutions, democracy, and policy developments globally in the last 24 hours.',
          'day',
        );
        if (sonar?.answer) {
          const CIVIC_KEYWORDS = [
            'governance', 'civic', 'democracy', 'legislature', 'parliament',
            'election', 'policy', 'regulation', 'institution', 'senate', 'congress',
            'un ', 'united nations', 'european union', 'imf', 'world bank',
          ];
          const lowerAnswer = sonar.answer.toLowerCase();
          if (CIVIC_KEYWORDS.some((kw) => lowerAnswer.includes(kw))) {
            const sonarEvent: RawEvent = {
              sourceId: `sonar-hermes-gov-${Date.now()}`,
              source: 'Perplexity Sonar',
              title: `Governance signal: ${sonar.answer.slice(0, 120)}`,
              summary: sonar.answer.slice(0, 500),
              url: sonar.sources[0]?.url ?? '',
              timestamp: sonar.timestamp,
              category: 'governance',
              severity: 'medium',
              metadata: {
                ownerAgent: 'HERMES',
                confidenceTier: 2,
                citedSources: sonar.sources.slice(0, 3).map((s) => s.url),
              },
            };
            rawEvents.push(sonarEvent);
          }
        }
      } catch {
        // Sonar bridge is best-effort — never fail ingest on Sonar error
      }
    }

    if (rawEvents.length === 0) {
      const emptyStatus = getEchoStatus();
      await writeEchoKvHeartbeatToMobius(emptyStatus, false);
      await saveEchoState({
        lastIngest: emptyStatus.lastIngest,
        cycleId: emptyStatus.cycleId,
        totalIngested: emptyStatus.totalIngested,
        healthy: false,
        epiconCount: emptyStatus.counts.epicon,
        ledgerCount: emptyStatus.counts.ledger,
        alertCount: emptyStatus.counts.alerts,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
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
    await persistEchoIngestSideEffects(result);

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
