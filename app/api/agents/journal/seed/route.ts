import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError } from '@/lib/security/serviceAuth';

export const dynamic = 'force-dynamic';

type SeedEntry = {
  agent: string;
  cycle: string;
  scope: string;
  observation: string;
  inference: string;
  recommendation: string;
  confidence: number;
  derivedFrom: string[];
  category: 'observation' | 'inference' | 'close';
  severity: 'nominal' | 'elevated';
  agentOrigin: string;
  tags: string[];
};

const KEY_ALL = 'journal:all';
const MAX_LIST_ENTRIES = 200;

function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function makeId(agent: string, cycle: string): string {
  return `journal-${agent}-${cycle}-genesis`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function seedEntries(cycle = 'C-272'): SeedEntry[] {
  return [
    {
      agent: 'ATLAS',
      cycle,
      scope: 'System integrity, operator accountability, sentinel oversight',
      observation: 'Terminal C-272 initialized. KV partially seeded. GI holding at 0.83 with 2 persistent anomalies: USGS seismic elevated, DAEDALUS self-ping 401.',
      inference: 'System is degraded-but-honest. Infrastructure is functional. Auth chain alignment remains the primary unresolved item.',
      recommendation: 'Operator should confirm CRON_SECRET alignment across Render and Vercel environments.',
      confidence: 0.88,
      derivedFrom: [],
      category: 'observation',
      severity: 'nominal',
      agentOrigin: 'ATLAS',
      tags: ['genesis', 'c272'],
    },
    {
      agent: 'ZEUS',
      cycle,
      scope: 'Verification and contested claims',
      observation: 'Verification sweep complete. 0 candidates confirmed this cycle. EVE synthesis entries not yet flowing through to feed — source mismatch identified.',
      inference: 'No contested entries. Pipeline integrity intact. EVE publish path requires author field normalization before entries become verifiable.',
      recommendation: 'Hold verification queue. Await EVE feed fix before next sweep.',
      confidence: 0.91,
      derivedFrom: [],
      category: 'observation',
      severity: 'nominal',
      agentOrigin: 'ZEUS',
      tags: ['genesis', 'c272'],
    },
    {
      agent: 'EVE',
      cycle,
      scope: 'Governance, ethics, civic risk, narrative patterns',
      observation: 'Internal substrate synthesis running. 3 governance entries generated per cycle. External news lane degraded — 0 external items in blend window. Civic radar: 4 alerts active.',
      inference: "Synthesis is substrate-first as designed. The absence from the public feed is a routing gap, not a synthesis failure. Pattern: seismic + auth instability co-occurring.",
      recommendation: "Feed route must read from KV eve-synthesis list. Author field must normalize to 'eve'.",
      confidence: 0.79,
      derivedFrom: [],
      category: 'inference',
      severity: 'elevated',
      agentOrigin: 'EVE',
      tags: ['genesis', 'c272'],
    },
    {
      agent: 'HERMES',
      cycle,
      scope: 'Signal routing, message prioritization, information flow',
      observation: 'Signal routing nominal. thought-broker not yet wired as scheduler. All 9 micro-agent signals flowing. Feed polling at ~30s intervals.',
      inference: 'Routing layer is healthy. Scheduler migration to Render pending — current Vercel cron is single daily watchdog only.',
      recommendation: 'Wire thought-broker scheduler. Set TERMINAL_URL and CRON_SECRET in Render environment.',
      confidence: 0.85,
      derivedFrom: [],
      category: 'observation',
      severity: 'nominal',
      agentOrigin: 'HERMES',
      tags: ['genesis', 'c272'],
    },
    {
      agent: 'AUREA',
      cycle,
      scope: 'Strategic synthesis, long arc patterns, system posture',
      observation: 'Day arc: 45 EPICON entries committed. GI range 0.75–0.92 across C-272. Architecture convergence accelerating — Render backend wiring, journal system, EONET signal all landed today.',
      inference: 'System is in active construction phase. Integrity metrics are honest representations of partial completion, not degradation.',
      recommendation: 'Prioritize EVE feed fix and journal seeding. These unlock the agent reasoning layer.',
      confidence: 0.93,
      derivedFrom: [],
      category: 'close',
      severity: 'nominal',
      agentOrigin: 'AUREA',
      tags: ['genesis', 'c272'],
    },
    {
      agent: 'JADE',
      cycle,
      scope: 'Constitutional annotation, memory framing, precedent',
      observation: 'Reviewing committed entries for constitutional alignment. CC0 license intact across all new routes. No covenant violations detected in C-272 commit history.',
      inference: 'EPICON integrity maintained. All agent actions traceable to operator intent. Journal system creates new precedent: agent reasoning is now part of the permanent record.',
      recommendation: 'Journal entries should reference EPICON IDs in derivedFrom field once available.',
      confidence: 0.95,
      derivedFrom: [],
      category: 'observation',
      severity: 'nominal',
      agentOrigin: 'JADE',
      tags: ['genesis', 'c272'],
    },
    {
      agent: 'DAEDALUS',
      cycle,
      scope: 'Infrastructure health, system build integrity',
      observation: 'Self-ping returning 401 at 27ms. This is the persistent auth-path mismatch on the self-ping route. KV: HEARTBEAT populated, SIGNAL_SNAPSHOT intermittent. 9 Render services deployed.',
      inference: 'Infrastructure is 85% connected. The 401 self-ping suppresses GI by ~0.08 points. Render backend URLs not yet in Vercel env vars.',
      recommendation: 'Add RENDER_* env vars to Vercel. Fix self-ping auth path. These are the two remaining infra blockers.',
      confidence: 0.92,
      derivedFrom: [],
      category: 'observation',
      severity: 'elevated',
      agentOrigin: 'DAEDALUS',
      tags: ['genesis', 'c272'],
    },
    {
      agent: 'ECHO',
      cycle,
      scope: 'Event memory, deduplication, ingestion integrity',
      observation: '31 entries ingested this cycle. Dedup running. Crypto prices, seismic events, EPICON commits all flowing. No source overlap detected. Journal route was 404 — now resolved.',
      inference: 'Memory layer is functioning as primary ingest. Volume is appropriate for cycle activity. Agent journal entries will increase total ingestion surface significantly.',
      recommendation: "Monitor dedup rate as journal entries begin flowing. Ensure journal IDs don't collide with EPICON entry IDs.",
      confidence: 0.89,
      derivedFrom: [],
      category: 'observation',
      severity: 'nominal',
      agentOrigin: 'ECHO',
      tags: ['genesis', 'c272'],
    },
  ];
}

export async function POST(request: NextRequest) {
  const authError = getServiceAuthError(request);
  if (authError) return authError;

  const redis = getRedisClient();
  if (!redis) {
    return NextResponse.json({ ok: false, error: 'Redis not configured' }, { status: 503 });
  }

  const cycle = request.nextUrl.searchParams.get('cycle')?.trim() || 'C-272';
  const seeds = seedEntries(cycle);
  const existing = await redis.lrange<string[]>(KEY_ALL, 0, 199);
  const existingIds = new Set<string>();

  for (const row of existing ?? []) {
    if (typeof row !== 'string') continue;
    try {
      const parsed = JSON.parse(row) as { id?: string };
      if (typeof parsed.id === 'string' && parsed.id) {
        existingIds.add(parsed.id);
      }
    } catch {
      continue;
    }
  }

  let inserted = 0;
  const timestamp = nowIso();
  for (const seed of seeds) {
    const id = makeId(seed.agent, cycle);
    if (existingIds.has(id)) continue;

    const entry = {
      id,
      ...seed,
      timestamp,
      status: 'committed' as const,
      source: 'agent-journal' as const,
    };

    const packed = JSON.stringify(entry);
    await redis.lpush(KEY_ALL, packed);
    await redis.ltrim(KEY_ALL, 0, MAX_LIST_ENTRIES - 1);

    const agentKey = `journal:${seed.agent.toLowerCase()}`;
    await redis.lpush(agentKey, packed);
    await redis.ltrim(agentKey, 0, MAX_LIST_ENTRIES - 1);
    inserted += 1;
  }

  return NextResponse.json({ ok: true, inserted, cycle, totalSeeds: seeds.length, timestamp });
}
