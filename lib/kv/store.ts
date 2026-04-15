/**
 * Mobius KV — Upstash Redis Persistence Layer
 *
 * Provides durable key-value storage that survives Vercel cold starts.
 * Uses Upstash Redis via HTTP REST (no TCP connections needed).
 *
 * Design:
 *   - Cache-through: read from Redis first, fall back to in-memory
 *   - Write-through: write to both Redis and in-memory simultaneously
 *   - Graceful degradation: if Redis is unavailable, system continues
 *     with in-memory-only behavior (same as before this integration)
 *   - All values are JSON-serialized automatically
 *   - TTL support for automatic expiration
 *
 * Required env vars (set in Vercel project settings):
 *   UPSTASH_REDIS_REST_URL   — Upstash REST endpoint (or KV_REST_API_URL from Vercel KV)
 *   UPSTASH_REDIS_REST_TOKEN — Upstash REST auth token (or KV_REST_API_TOKEN)
 *
 * Free tier: 500K commands/month, more than enough for this project.
 *
 * CC0 Public Domain
 */

import { Redis } from '@upstash/redis';

// ── Redis client (lazy singleton) ────────────────────────────

let _redis: Redis | null = null;
let _redisAvailable: boolean | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _redisAvailable = false;
    return null;
  }

  try {
    _redis = new Redis({ url, token });
    _redisAvailable = true;
    return _redis;
  } catch {
    _redisAvailable = false;
    return null;
  }
}

/**
 * Check if Redis is configured and available.
 */
export function isRedisAvailable(): boolean {
  if (_redisAvailable !== null) return _redisAvailable;
  getRedis();
  return _redisAvailable ?? false;
}

// ── Key prefix (namespace all Mobius keys) ───────────────────

const PREFIX = 'mobius:';

function prefixKey(key: string): string {
  return `${PREFIX}${key}`;
}

// ── Core operations ──────────────────────────────────────────

/**
 * Get a value from Redis. Returns null if not found or Redis unavailable.
 */
export async function kvGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const value = await redis.get<T>(prefixKey(key));
    return value;
  } catch (err) {
    console.warn(`[mobius-kv] GET ${key} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Read Redis key exactly as given (no `mobius:` prefix). */
export async function kvGetRaw<T>(rawKey: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get<T>(rawKey);
  } catch (err) {
    console.warn(`[mobius-kv] GET raw ${rawKey} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Set a value in Redis.
 * @param ttlSeconds — optional TTL in seconds (default: no expiry)
 */
export async function kvSet<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    if (ttlSeconds) {
      await redis.set(prefixKey(key), value, { ex: ttlSeconds });
    } else {
      await redis.set(prefixKey(key), value);
    }
    return true;
  } catch (err) {
    console.warn(`[mobius-kv] SET ${key} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Set a value at the exact Redis key (no `mobius:` prefix). For legacy keys like `TRIPWIRE_STATE`.
 */
export async function kvSetRawKey<T>(rawKey: string, value: T, ttlSeconds?: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    if (ttlSeconds) {
      await redis.set(rawKey, value, { ex: ttlSeconds });
    } else {
      await redis.set(rawKey, value);
    }
    return true;
  } catch (err) {
    console.warn(`[mobius-kv] SET raw ${rawKey} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Delete a key from Redis.
 */
export async function kvDel(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.del(prefixKey(key));
    return true;
  } catch (err) {
    console.warn(`[mobius-kv] DEL ${key} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Check if a key exists in Redis.
 */
export async function kvExists(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const result = await redis.exists(prefixKey(key));
    return result === 1;
  } catch {
    return false;
  }
}

// ── Mobius-specific compound operations ──────────────────────

/**
 * Key constants for Mobius state
 */
export const KV_KEYS = {
  /** Last signal snapshot from micro-agents */
  SIGNAL_SNAPSHOT: 'signals:latest',
  /** Last GI computation result */
  GI_STATE: 'gi:latest',
  /** ECHO store state (epicon, ledger, alerts) */
  ECHO_STATE: 'echo:state',
  /**
   * ECHO ingest heartbeat — mirrors legacy `ECHO_STATE` string key checks in ops tooling.
   * Written alongside `echo:state` on each ingest.
   */
  ECHO_STATE_KV: 'echo:kv:heartbeat',
  /** Tripwire state */
  TRIPWIRE_STATE: 'tripwire:state',
  /** Tripwire heartbeat for KV key-exists diagnostics (mirrors legacy TRIPWIRE_STATE string key) */
  TRIPWIRE_STATE_KV: 'tripwire:kv:heartbeat',
  /** Last heartbeat timestamp */
  HEARTBEAT: 'heartbeat:last',
  /** Last ingest timestamp */
  LAST_INGEST: 'ingest:last',
} as const;

// ── Signal snapshot persistence ──────────────────────────────

export type SignalSnapshot = {
  composite: number;
  anomalies: number;
  allSignals: Array<{
    agentName: string;
    source: string;
    value: number;
    label: string;
    severity: string;
  }>;
  timestamp: string;
  healthy: boolean;
};

/**
 * Save the latest signal snapshot to Redis.
 * TTL: 10 minutes (signals older than this are stale).
 */
export async function saveSignalSnapshot(snapshot: SignalSnapshot): Promise<void> {
  await kvSet(KV_KEYS.SIGNAL_SNAPSHOT, snapshot, 600);
}

/**
 * Load the latest signal snapshot from Redis.
 */
export async function loadSignalSnapshot(): Promise<SignalSnapshot | null> {
  return kvGet<SignalSnapshot>(KV_KEYS.SIGNAL_SNAPSHOT);
}

// ── GI state persistence ─────────────────────────────────────

export type GIState = {
  global_integrity: number;
  mode: string;
  terminal_status: string;
  primary_driver: string;
  source: 'live' | 'mock' | 'cached';
  signals: {
    quality: number;
    freshness: number;
    stability: number;
    system: number;
  };
  timestamp: string;
};

/**
 * Save the latest GI state. TTL: 15 minutes.
 */
export async function saveGIState(state: GIState): Promise<void> {
  await kvSet(KV_KEYS.GI_STATE, state, 900);
}

/**
 * Load the last-known GI state from Redis.
 */
export async function loadGIState(): Promise<GIState | null> {
  return kvGet<GIState>(KV_KEYS.GI_STATE);
}

// ── ECHO state persistence ───────────────────────────────────

export type EchoKVState = {
  lastIngest: string | null;
  cycleId: string;
  totalIngested: number;
  healthy: boolean;
  epiconCount: number;
  ledgerCount: number;
  alertCount: number;
  dedupRate?: number;
  timestamp: string;
};

/**
 * Save ECHO store summary. TTL: 2 hours (matches /api/cron/echo-ingest cadence).
 */
export async function saveEchoState(state: EchoKVState): Promise<void> {
  await kvSet(KV_KEYS.ECHO_STATE, state, 7200);
}

/**
 * Load ECHO store summary.
 */
export async function loadEchoState(): Promise<EchoKVState | null> {
  return kvGet<EchoKVState>(KV_KEYS.ECHO_STATE);
}

// ── Tripwire state persistence ───────────────────────────────

export type TripwireKVState = {
  cycleId: string;
  tripwireCount: number;
  elevated: boolean;
  timestamp: string;
};

/**
 * Save tripwire state. TTL: 30 minutes.
 */
export async function saveTripwireState(state: TripwireKVState): Promise<void> {
  await kvSet(KV_KEYS.TRIPWIRE_STATE, state, 1800);
}

/**
 * Load tripwire state.
 */
export async function loadTripwireState(): Promise<TripwireKVState | null> {
  return kvGet<TripwireKVState>(KV_KEYS.TRIPWIRE_STATE);
}

// ── Health check ─────────────────────────────────────────────

/**
 * Check Redis health and return diagnostic info.
 */
export type KvInspectKeyRow = {
  key: string;
  type: string;
  ttlSeconds: number | null;
  sample: unknown;
};

/**
 * Operator debug: list Redis keys matching pattern and sample values.
 * Uses raw Redis key names (includes `mobius:` prefix where writers use `kvSet`).
 */
export async function kvInspectSamples(pattern: string, limit: number): Promise<{
  ok: boolean;
  error: string | null;
  totalMatched: number;
  keys: KvInspectKeyRow[];
}> {
  const redis = getRedis();
  if (!redis) {
    return { ok: false, error: 'Redis unavailable or not configured', totalMatched: 0, keys: [] };
  }

  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const safePattern = pattern.trim() || '*';

  try {
    const matched = await redis.keys(safePattern);
    const totalMatched = matched.length;
    const slice = matched.slice(0, safeLimit);
    const keys: KvInspectKeyRow[] = [];

    for (const key of slice) {
      const t = await redis.type(key);
      let ttlSeconds: number | null = null;
      try {
        const ttl = await redis.ttl(key);
        ttlSeconds = ttl === undefined || ttl === null ? null : ttl;
      } catch {
        ttlSeconds = null;
      }

      let sample: unknown = null;
      try {
        if (t === 'string') {
          sample = await redis.get(key);
        } else if (t === 'list') {
          sample = await redis.lrange(key, 0, 4);
        } else if (t === 'hash') {
          sample = await redis.hgetall(key);
        } else if (t === 'zset') {
          sample = await redis.zrange(key, 0, 4, { withScores: true });
        } else {
          sample = { note: `unsupported type: ${t}` };
        }
      } catch (err) {
        sample = { error: err instanceof Error ? err.message : 'read failed' };
      }

      keys.push({ key, type: t, ttlSeconds, sample });
    }

    return { ok: true, error: null, totalMatched, keys };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'keys scan failed',
      totalMatched: 0,
      keys: [],
    };
  }
}

export async function kvHealth(): Promise<{
  available: boolean;
  configured: boolean;
  latencyMs: number | null;
  error: string | null;
}> {
  const configured = !!(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );

  if (!configured) {
    return { available: false, configured: false, latencyMs: null, error: 'Env vars not set' };
  }

  const redis = getRedis();
  if (!redis) {
    return { available: false, configured: true, latencyMs: null, error: 'Redis client init failed' };
  }

  try {
    const start = Date.now();
    await redis.ping();
    const latencyMs = Date.now() - start;
    return { available: true, configured: true, latencyMs, error: null };
  } catch (err) {
    return {
      available: false,
      configured: true,
      latencyMs: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
