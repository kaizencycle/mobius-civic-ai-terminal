/**
 * Optional TCP Redis (`REDIS_URL`) for health checks and optional write mirroring.
 *
 * Primary Mobius KV remains Upstash REST (`KV_REST_API_URL` / `UPSTASH_REDIS_*`).
 * This path is for operators who also run a classic Redis URL (Render, Fly,
 * self-hosted) as a secondary store or DR target.
 *
 * Mirroring is OFF by default — set `MOBIUS_KV_BACKUP_MIRROR=true` to duplicate
 * successful `kvSet` / `kvSetRawKey` writes (same key names as primary).
 */

import Redis from 'ioredis';

let _backup: Redis | null | undefined;

function backupMirrorEnabled(): boolean {
  const v = process.env.MOBIUS_KV_BACKUP_MIRROR?.trim().toLowerCase();
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

export type BackupRedisHealth = {
  configured: boolean;
  mirror_enabled: boolean;
  available: boolean;
  latency_ms: number | null;
  error: string | null;
};

export async function getBackupRedisHealth(): Promise<BackupRedisHealth> {
  const configured = Boolean(process.env.REDIS_URL?.trim());
  const mirror_enabled = backupMirrorEnabled();

  if (!configured) {
    return {
      configured: false,
      mirror_enabled,
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
      available: false,
      latency_ms: null,
      error: 'Backup Redis client init failed',
    };
  }

  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const start = Date.now();
    const pong = await client.ping();
    const latency_ms = Date.now() - start;
    return {
      configured: true,
      mirror_enabled,
      available: pong === 'PONG',
      latency_ms,
      error: pong === 'PONG' ? null : `unexpected ping reply: ${String(pong)}`,
    };
  } catch (err) {
    return {
      configured: true,
      mirror_enabled,
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

function scheduleMirror(
  key: string,
  value: unknown,
  ttlSeconds: number | undefined,
  label: string,
): void {
  if (!backupMirrorEnabled()) return;

  void (async () => {
    const client = getBackupClient();
    if (!client) return;
    try {
      if (client.status === 'wait') {
        await client.connect();
      }
      const payload = serializeValue(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, payload, 'EX', ttlSeconds);
      } else {
        await client.set(key, payload);
      }
    } catch (err) {
      console.warn(
        `[mobius-kv:backup] mirror ${label} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  })();
}

/** Fire-and-forget duplicate of a prefixed mobius KV write. */
export function scheduleBackupMirrorPrefixedKey(
  prefixedKey: string,
  value: unknown,
  ttlSeconds?: number,
): void {
  scheduleMirror(prefixedKey, value, ttlSeconds, prefixedKey);
}

/** Fire-and-forget duplicate of a raw Redis key write. */
export function scheduleBackupMirrorRawKey(
  rawKey: string,
  value: unknown,
  ttlSeconds?: number,
): void {
  scheduleMirror(rawKey, value, ttlSeconds, rawKey);
}
