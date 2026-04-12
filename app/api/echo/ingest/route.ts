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
import { Redis } from '@upstash/redis';
import { fetchAllSources } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { pushIngestResult, getEchoStatus, getEchoEpicon, getEchoLedger, getEchoAlerts } from '@/lib/echo/store';
import { writeSnapshot } from '@/lib/echo/snapshot-writer';
import { saveEchoState, loadGIState } from '@/lib/kv/store';
import { writeMiiState } from '@/lib/kv/mii';

export const dynamic = 'force-dynamic';

type KvEpiconEntry = {
  id: string;
  timestamp: string;
  author: string;
  title: string;
  type: 'epicon';
  severity: 'nominal' | 'elevated' | 'critical' | 'degraded' | 'info';
  source: 'kv-ledger';
  tags: string[];
  verified: boolean;
};

function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function toFeedSeverity(confidenceTier: number): KvEpiconEntry['severity'] {
  if (confidenceTier >= 3) return 'critical';
  if (confidenceTier >= 2) return 'elevated';
  if (confidenceTier >= 1) return 'nominal';
  return 'info';
}

function toFeedTimestamp(rawTimestamp: string): string {
  const ts = new Date(rawTimestamp);
  if (Number.isNaN(ts.getTime())) return new Date().toISOString();
  return ts.toISOString();
}

async function flushEpiconFeed(entries: KvEpiconEntry[]): Promise<void> {
  const redis = getRedisClient();
  if (!redis || entries.length === 0) return;

  try {
    const payload = entries.map((entry) => JSON.stringify(entry));
    await redis.lpush('epicon:feed', ...payload);
    await redis.ltrim('epicon:feed', 0, 99);
  } catch (error) {
    console.error('[echo] epicon feed flush failed:', error);
  }
}

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
      const emptyStatus = getEchoStatus();
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
    const status = getEchoStatus();
    const dedupDenominator = Math.max(1, status.totalIngested + status.duplicateSuppressedCount);
    const dedupRate = Number((status.duplicateSuppressedCount / dedupDenominator).toFixed(3));
    await saveEchoState({
      lastIngest: status.lastIngest,
      cycleId: status.cycleId,
      totalIngested: status.totalIngested,
      healthy: true,
      epiconCount: status.counts.epicon,
      ledgerCount: status.counts.ledger,
      alertCount: status.counts.alerts,
      timestamp: new Date().toISOString(),
      dedupRate,
    }).catch(() => {});

    const kvFeedEntries: KvEpiconEntry[] = result.epicon.map((entry) => ({
      id: entry.id,
      timestamp: toFeedTimestamp(entry.timestamp),
      author: entry.ownerAgent,
      title: entry.title,
      type: 'epicon',
      severity: entry.status === 'contradicted' ? 'degraded' : toFeedSeverity(entry.confidenceTier),
      source: 'kv-ledger',
      tags: entry.sources,
      verified: entry.status === 'verified',
    }));
    await flushEpiconFeed(kvFeedEntries);

    // 5. Write MII state for each rated agent (fire-and-forget)
    void (async () => {
      try {
        const giState = await loadGIState();
        const currentGi = Number((giState?.global_integrity ?? 0.74).toFixed(4));
        const miiTimestamp = new Date().toISOString();
        const agentAverages = result.integrity.agentAverages;
        const agents = ['ATLAS', 'ZEUS', 'JADE', 'EVE'] as const;

        await Promise.all(
          agents
            .filter((agent) => typeof agentAverages[agent] === 'number')
            .map((agent) =>
              writeMiiState({
                agent,
                mii: Number(agentAverages[agent].toFixed(4)),
                gi: currentGi,
                cycle: result.cycleId,
                timestamp: miiTimestamp,
                source: 'live',
              }),
            ),
        );
      } catch (err) {
        console.error('[echo] mii write failed:', err instanceof Error ? err.message : err);
      }
    })();

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
