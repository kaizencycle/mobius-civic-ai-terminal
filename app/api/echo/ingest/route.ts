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
import type { RawEvent } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { pushIngestResult, getEchoStatus, getEchoEpicon, getEchoLedger, getEchoAlerts } from '@/lib/echo/store';
import { writeSnapshot } from '@/lib/echo/snapshot-writer';
import { saveEchoState, loadGIState } from '@/lib/kv/store';
import { readMiiFeed, type MiiEntry } from '@/lib/kv/mii';
import { querySonarForLane } from '@/lib/signals/perplexity-sonar';
import { currentCycleId } from '@/lib/eve/cycle-engine';

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

async function writeEchoKvHeartbeat(status: ReturnType<typeof getEchoStatus>): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const now = new Date().toISOString();
  try {
    await redis.set(
      'ECHO_STATE',
      JSON.stringify({
        cycleId: currentCycleId(),
        lastIngest: now,
        totalIngested: status.totalIngested,
        duplicateSuppressed: status.duplicateSuppressedCount,
        healthy: true,
        timestamp: now,
      }),
    );
  } catch (error) {
    console.error('[echo] ECHO_STATE write failed:', error);
  }
}

async function writeMiiFeedBatch(entries: MiiEntry[]): Promise<void> {
  const redis = getRedisClient();
  if (!redis || entries.length === 0) return;
  try {
    const packed = entries.map((entry) => JSON.stringify(entry));
    await Promise.all(entries.map((entry) => redis.set(`mii:${entry.agent.toUpperCase()}:${entry.cycle}`, JSON.stringify(entry))));
    await redis.lpush('mii:feed', ...packed);
    await redis.ltrim('mii:feed', 0, 199);
  } catch (error) {
    console.error('[echo] mii batch write failed:', error);
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
    await writeEchoKvHeartbeat(status);
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
        const recentFeed = await readMiiFeed();
        const lastKnown: Record<string, number> = {};
        for (const entry of recentFeed) {
          if (!(entry.agent in lastKnown)) {
            lastKnown[entry.agent] = entry.mii;
          }
        }
        const batch: MiiEntry[] = agents.map((agent) => ({
          agent,
          mii: Number((typeof agentAverages[agent] === 'number' ? agentAverages[agent] : (lastKnown[agent] ?? 0.90)).toFixed(4)),
          gi: currentGi,
          cycle: result.cycleId,
          timestamp: miiTimestamp,
          source: 'live',
        }));
        await writeMiiFeedBatch(batch);
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
