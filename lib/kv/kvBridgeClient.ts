/**
 * OAA KV bridge client — warm fallback when Upstash REST hits monthly limits or errors.
 * Server-side only; requires OAA_API_BASE_URL (or OAA_API_BASE / NEXT_PUBLIC_OAA_API_URL) + KV_BRIDGE_SECRET.
 */

import {
  prefixedRedisKeyToBridgeSymbol,
  rawRedisKeyToBridgeSymbol,
  VAULT_BRIDGE_SYMBOL,
} from '@/lib/kv/kvBridgeKeys';

function oaaBaseUrl(): string {
  const u =
    process.env.OAA_API_BASE_URL?.trim() ||
    process.env.OAA_API_BASE?.trim() ||
    process.env.NEXT_PUBLIC_OAA_API_URL?.trim() ||
    '';
  return u.replace(/\/$/, '');
}

export function kvBridgeConfigured(): boolean {
  return Boolean(oaaBaseUrl() && process.env.KV_BRIDGE_SECRET?.trim());
}

export interface KvBridgeReadResult {
  ok: boolean;
  key: string;
  value: unknown;
  written_at: string;
  source?: string;
}

function abortMs(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

/** Upstash / network conditions where OAA warm tier should be tried. */
export function isKvCapacityOrTransportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('max requests limit exceeded') ||
    lower.includes('max requests exceeded') ||
    lower.includes('limit: 500000') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('socket hang up') ||
    lower.includes('network error')
  );
}

/**
 * POST snapshot to OAA. `key` must be a bridge allowlist symbol (e.g. GI_STATE).
 */
export async function kvBridgeWrite(
  bridgeKey: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<boolean> {
  const base = oaaBaseUrl();
  const secret = process.env.KV_BRIDGE_SECRET?.trim();
  if (!base || !secret) return false;

  try {
    const res = await fetch(`${base}/api/kv-bridge/write`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        key: bridgeKey,
        value,
        ttl_seconds: ttlSeconds,
        source: 'terminal',
      }),
      signal: abortMs(8000),
    });
    return res.ok;
  } catch (err) {
    console.warn(
      '[mobius-kv:bridge] write failed:',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

export async function kvBridgeRead(bridgeKey: string): Promise<KvBridgeReadResult | null> {
  const base = oaaBaseUrl();
  if (!base) return null;

  try {
    const res = await fetch(
      `${base}/api/kv-bridge/read?key=${encodeURIComponent(bridgeKey)}`,
      { signal: abortMs(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as KvBridgeReadResult | null;
    if (!data || typeof data !== 'object' || !data.ok) return null;
    return data;
  } catch (err) {
    console.warn(
      '[mobius-kv:bridge] read failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Fire-and-forget mirror after successful primary SET (prefixed `mobius:` key). */
export function scheduleKvBridgeMirrorPrefixed(prefixedKey: string, value: unknown, ttlSeconds?: number): void {
  if (!kvBridgeConfigured()) return;
  const symbol = prefixedRedisKeyToBridgeSymbol(prefixedKey);
  if (!symbol || symbol === VAULT_BRIDGE_SYMBOL) return;
  void kvBridgeWrite(symbol, value, ttlSeconds).catch(() => {});
}

/** Fire-and-forget mirror for raw Redis keys (legacy TRIPWIRE_STATE, etc.). */
export function scheduleKvBridgeMirrorRaw(rawKey: string, value: unknown, ttlSeconds?: number): void {
  if (!kvBridgeConfigured()) return;
  const symbol = rawRedisKeyToBridgeSymbol(rawKey);
  if (!symbol) return;
  void kvBridgeWrite(symbol, value, ttlSeconds).catch(() => {});
}

export async function kvBridgeReadForPrefixedKey<T>(prefixedKey: string): Promise<T | null> {
  const symbol = prefixedRedisKeyToBridgeSymbol(prefixedKey);
  if (!symbol) return null;
  const row = await kvBridgeRead(symbol);
  return (row?.value as T) ?? null;
}

export async function kvBridgeReadForRawKey<T>(rawKey: string): Promise<T | null> {
  const symbol = rawRedisKeyToBridgeSymbol(rawKey);
  if (!symbol) return null;
  const row = await kvBridgeRead(symbol);
  return (row?.value as T) ?? null;
}

export type VaultBridgePayload = {
  balance: unknown;
  meta: unknown;
  bridged_at: string;
};

/** Single bridge slot for `mobius:vault:global:balance` + `mobius:vault:global:meta`. */
export async function kvBridgeWriteVaultSnapshot(
  balance: unknown,
  meta: unknown,
  ttlSeconds?: number,
): Promise<boolean> {
  if (!kvBridgeConfigured()) return false;
  const payload: VaultBridgePayload = {
    balance,
    meta,
    bridged_at: new Date().toISOString(),
  };
  return kvBridgeWrite(VAULT_BRIDGE_SYMBOL, payload, ttlSeconds);
}

export async function kvBridgeReadVaultComposite<TBalance, TMeta>(): Promise<{
  balance: TBalance | null;
  meta: TMeta | null;
} | null> {
  const row = await kvBridgeRead(VAULT_BRIDGE_SYMBOL);
  if (!row?.ok || row.value === null || row.value === undefined) return null;
  const v = row.value as Record<string, unknown>;
  if (typeof v !== 'object' || v === null) return null;
  if (!('balance' in v) && !('meta' in v)) return null;
  return {
    balance: ('balance' in v ? v.balance : null) as TBalance | null,
    meta: ('meta' in v ? v.meta : null) as TMeta | null,
  };
}
