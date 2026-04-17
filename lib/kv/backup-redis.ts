/**
 * Optional TCP Redis (`REDIS_URL`) alongside primary Upstash REST KV.
 *
 * - **Health**: `getBackupRedisHealth()` for `/api/kv/health`.
 * - **Write mirror**: `MOBIUS_KV_BACKUP_MIRROR=true` duplicates string SETs and list writes.
 * - **Read fallback**: `MOBIUS_KV_READ_FALLBACK=true` uses `REDIS_URL` when primary GET misses
 *   or primary KV is unavailable / errors (best-effort DR read path).
 */

import Redis from 'ioredis';

let _backup: Redis | null | undefined;

export function backupMirrorEnabled(): boolean {
  const v = process.env.MOBIUS_KV_BACKUP_MIRROR?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function backupReadFallbackEnabled(): boolean {
  const v = process.env.MOBIUS_KV_READ_FALLBACK?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function getBackupClient(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    _backup = null;
    return null;
  }
  if (_backup !== undefined) return _backup;

  try {
    _backup = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    return _backup;
  } catch {
    _backup = null;
    return null;
  }
}

async function ensureConnected(client: Redis): Promise<void> {
  if (client.status === 'wait' || client.status === 'end') {
    await client.connect();
  }
}

export type BackupRedisHealth = {
  configured: boolean;
  mirror_enabled: boolean;
  read_fallback_enabled: boolean;
  available: boolean;
  latency_ms: number | null;
  error: string | null;
};

export async function getBackupRedisHealth(): Promise<BackupRedisHealth> {
  const configured = Boolean(process.env.REDIS_URL?.trim());
  const mirror_enabled = backupMirrorEnabled();
  const read_fallback_enabled = backupReadFallbackEnabled();

  if (!configured) {
    return {
      configured: false,
      mirror_enabled,
      read_fallback_enabled,
      available: false,
      latency_ms: null,
      error: null,
    };
  }

  const client = getBackupClient();
  if (!client) {
    return {
      configured: true,
      mirror_enabled,
      read_fallback_enabled,
      available: false,
      latency_ms: null,
      error: 'Backup Redis client init failed',
    };
  }

  try {
    await ensureConnected(client);
    const start = Date.now();
    const pong = await client.ping();
    const latency_ms = Date.now() - start;
    return {
      configured: true,
      mirror_enabled,
      read_fallback_enabled,
      available: pong === 'PONG',
      latency_ms,
      error: pong === 'PONG' ? null : `unexpected ping reply: ${String(pong)}`,
    };
  } catch (err) {
    return {
      configured: true,
      mirror_enabled,
      read_fallback_enabled,
      available: false,
      latency_ms: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseBackupGet<T>(raw: string | null): T | null {
  if (raw === null || raw === undefined) return null;
  const s = typeof raw === 'string' ? raw : String(raw);
  if (s.length === 0) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    const n = Number(s);
    if (Number.isFinite(n) && s.trim() !== '') return n as unknown as T;
    return s as unknown as T;
  }
}

/**
 * GET from backup Redis (raw key). Returns null if disabled, unconfigured, or missing.
 */
export async function backupRawGet<T>(rawKey: string): Promise<T | null> {
  if (!backupReadFallbackEnabled()) return null;

  const client = getBackupClient();
  if (!client) return null;

  try {
    await ensureConnected(client);
    const raw = await client.get(rawKey);
    if (raw === null) return null;
    return parseBackupGet<T>(raw);
  } catch (err) {
    console.warn(
      `[mobius-kv:backup] GET raw ${rawKey} failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function backupPrefixedGet<T>(logicalKey: string): Promise<T | null> {
  return backupRawGet<T>(`mobius:${logicalKey}`);
}

/** LRANGE on backup when read fallback is enabled (for mirrored list keys). */
export async function backupRawLrange(rawKey: string, start: number, stop: number): Promise<string[]> {
  if (!backupReadFallbackEnabled()) return [];
  const client = getBackupClient();
  if (!client) return [];
  try {
    await ensureConnected(client);
    const rows = await client.lrange(rawKey, start, stop);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      `[mobius-kv:backup] LRANGE ${rawKey} failed:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

function scheduleMirror(
  fn: (client: Redis) => Promise<void>,
  label: string,
): void {
  if (!backupMirrorEnabled()) return;

  void (async () => {
    const client = getBackupClient();
    if (!client) return;
    try {
      await ensureConnected(client);
      await fn(client);
    } catch (err) {
      console.warn(
        `[mobius-kv:backup] mirror ${label} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  })();
}

export function scheduleBackupMirrorPrefixedKey(
  prefixedKey: string,
  value: unknown,
  ttlSeconds?: number,
): void {
  scheduleMirror(async (client) => {
    const payload = serializeValue(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(prefixedKey, payload, 'EX', ttlSeconds);
    } else {
      await client.set(prefixedKey, payload);
    }
  }, prefixedKey);
}

export function scheduleBackupMirrorRawKey(
  rawKey: string,
  value: unknown,
  ttlSeconds?: number,
): void {
  scheduleMirror(async (client) => {
    const payload = serializeValue(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(rawKey, payload, 'EX', ttlSeconds);
    } else {
      await client.set(rawKey, payload);
    }
  }, rawKey);
}

export function scheduleBackupMirrorRawDel(rawKey: string): void {
  scheduleMirror(async (client) => {
    await client.del(rawKey);
  }, `DEL ${rawKey}`);
}

/** Mirror `vault:deposits` LPUSH + LTRIM (newest-first list, same semantics as primary). */
export function scheduleBackupMirrorVaultDepositsLpush(
  listKey: string,
  depositJson: string,
  maxLen: number,
): void {
  scheduleMirror(async (client) => {
    const pl = client.multi();
    pl.lpush(listKey, depositJson);
    pl.ltrim(listKey, 0, maxLen - 1);
    await pl.exec();
  }, `${listKey} LPUSH`);
}
