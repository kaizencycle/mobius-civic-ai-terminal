import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { kvGet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

// ── Redis client (mirrors pattern from lib/kv/store.ts) ──────────────────────

function getRedis(): Redis | null {
  const url   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try { return new Redis({ url, token }); } catch { return null; }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SearchResult extends Record<string, unknown> {
  source: 'journal' | 'vault' | 'ledger' | 'epicon-cache';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matchesQuery(entry: Record<string, unknown>, q: string): boolean {
  return JSON.stringify(entry).toUpperCase().includes(q);
}

function toMs(ts: unknown): number {
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') { const ms = new Date(ts).getTime(); return isNaN(ms) ? 0 : ms; }
  return 0;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim().toUpperCase();

  if (!q) return NextResponse.json({ ok: false, error: 'q required' }, { status: 400 });

  const isCycle = /^C-\d+$/.test(q);
  const isAgent = /^(ATLAS|ZEUS|EVE|JADE|AUREA|HERMES|ECHO|DAEDALUS)/.test(q);
  const isSeal  = /^SEAL-/.test(q);

  const results: SearchResult[] = [];
  const redis = getRedis();

  // ── 1. KV journal entries (raw keys: journal:{agent}:{timestamp}) ─────────
  // Written via kvSetRawKey — no mobius: prefix.
  if (redis) {
    try {
      const keys = await redis.keys('journal:*');
      const filteredKeys = isCycle
        ? keys // cycle match is by content, not key name — load all, filter below
        : keys;
      const entries = await Promise.all(
        filteredKeys.slice(0, 100).map(k => redis.get<Record<string, unknown>>(k))
      );
      for (const entry of entries) {
        if (!entry) continue;
        if (!matchesQuery(entry, q)) continue;
        results.push({ source: 'journal', ...entry });
      }
    } catch (err) {
      console.warn('[pulse/search] KV journal scan failed:', err);
    }
  }

  // ── 2. Vault seals (index at raw key vault:seals:index:all) ──────────────
  // Individual seals at vault:seal:{seal_id} — also raw keys.
  if (redis && !isAgent) {
    try {
      const index = (await redis.get<string[]>('vault:seals:index:all')) ?? [];
      const matching = (isCycle || isSeal)
        ? index.filter(id => id.toUpperCase().includes(isSeal ? q.replace('SEAL-', '') : q))
        : index; // freetext — load all, filter by content below
      const seals = await Promise.all(
        matching.slice(0, 50).map(id => redis.get<Record<string, unknown>>(`vault:seal:${id}`))
      );
      for (const seal of seals) {
        if (!seal) continue;
        if (!matchesQuery(seal, q)) continue;
        results.push({ source: 'vault', ...seal });
      }
    } catch (err) {
      console.warn('[pulse/search] KV vault scan failed:', err);
    }
  }

  // ── 3. Render Civic Ledger ────────────────────────────────────────────────
  const ledgerBase  = process.env.RENDER_LEDGER_URL ?? 'https://civic-protocol-core-ledger.onrender.com';
  const authToken   = process.env.SUBSTRATE_TOKEN ?? process.env.AGENT_SERVICE_TOKEN ?? '';
  let ledgerHit = false;
  try {
    const res = await fetch(`${ledgerBase}/ledger/events?limit=200&offset=0`, {
      headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });
    if (res.ok) {
      const payload = await res.json() as Record<string, unknown>;
      const events: Record<string, unknown>[] = Array.isArray(payload)
        ? (payload as Record<string, unknown>[])
        : Array.isArray(payload.events)  ? (payload.events as Record<string, unknown>[])
        : Array.isArray(payload.items)   ? (payload.items   as Record<string, unknown>[])
        : Array.isArray(payload.entries) ? (payload.entries as Record<string, unknown>[])
        : [];
      for (const ev of events) {
        if (!matchesQuery(ev, q)) continue;
        results.push({ source: 'ledger', ...ev });
      }
      ledgerHit = true;
    }
  } catch (err) {
    console.warn('[pulse/search] Ledger query failed:', err);
  }

  // ── 4. EPICON KV cache fallback (if ledger unreachable) ──────────────────
  // Written via kvSet — key is mobius-prefixed; use kvGet to read.
  if (!ledgerHit) {
    try {
      const cached = await kvGet<{ entries?: Record<string, unknown>[] }>('epicon:render-ledger-cache');
      if (cached?.entries) {
        for (const ev of cached.entries) {
          if (!matchesQuery(ev, q)) continue;
          results.push({ source: 'epicon-cache', ...ev });
        }
      }
    } catch {
      // silent — best-effort fallback
    }
  }

  // Sort newest first, handling both ISO strings and numeric epoch ms
  results.sort((a, b) =>
    toMs(b.attested_at ?? b.writtenAt ?? b.timestamp) -
    toMs(a.attested_at ?? a.writtenAt ?? a.timestamp)
  );

  return NextResponse.json({
    ok: true,
    query: q,
    queryType: isCycle ? 'cycle' : isAgent ? 'agent' : isSeal ? 'seal' : 'freetext',
    count: results.length,
    results: results.slice(0, 200),
  });
}
