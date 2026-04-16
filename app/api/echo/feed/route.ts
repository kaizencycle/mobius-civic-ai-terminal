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
import { isRedisAvailable } from '@/lib/kv/store';
import { Redis } from '@upstash/redis';
import type { LedgerEntry } from '@/lib/terminal/types';

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

  const echoLedger = getEchoLedger();
  let kvLedgerEntries: LedgerEntry[] = [];

  if (isRedisAvailable()) {
    try {
      const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
      if (url && token) {
        const redis = new Redis({ url, token });
        const raw = await redis.lrange<string>('mobius:epicon:feed', 0, 99);
        for (const item of raw) {
          try {
            const parsed: Record<string, unknown> = typeof item === 'string' ? JSON.parse(item) : (item as Record<string, unknown>);
            if (!parsed.id || !parsed.timestamp) continue;
            kvLedgerEntries.push({
              id: String(parsed.id),
              cycleId: String(parsed.cycle ?? parsed.category ?? ''),
              type: 'attestation',
              agentOrigin: String(parsed.author ?? parsed.agentOrigin ?? 'SYSTEM'),
              timestamp: String(parsed.timestamp),
              title: String(parsed.title ?? ''),
              summary: String(parsed.title ?? parsed.body ?? ''),
              integrityDelta: 0,
              status: (parsed.status === 'committed' || parsed.status === 'pending' || parsed.status === 'reverted')
                ? parsed.status as 'committed' | 'pending' | 'reverted'
                : 'committed',
              category: typeof parsed.category === 'string' && ['geopolitical', 'market', 'governance', 'infrastructure', 'narrative', 'ethics', 'civic-risk'].includes(parsed.category)
                ? parsed.category as LedgerEntry['category']
                : undefined,
              confidenceTier: typeof parsed.confidenceTier === 'number' ? parsed.confidenceTier : undefined,
              tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : undefined,
              source: 'agent_commit',
            });
          } catch {
            // skip malformed entries
          }
        }
      }
    } catch {
      // KV read failure — continue with echo-only data
    }
  }

  const seenIds = new Set<string>();
  const merged: LedgerEntry[] = [];
  for (const row of [...kvLedgerEntries, ...echoLedger]) {
    if (seenIds.has(row.id)) continue;
    seenIds.add(row.id);
    merged.push(row);
  }
  merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const capped = merged.slice(0, 100);

  return NextResponse.json({
    epicon: getEchoEpicon(),
    ledger: capped,
    alerts: getEchoAlerts(),
    integrity: getEchoIntegrity(),
    status: getEchoStatus(),
  });
}
