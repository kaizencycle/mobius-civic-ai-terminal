// C-338 — Runtime Identity JWT minting for ledger attestation.
//
// ROOT CAUSE (C-326→C-338 attestation saga): the ledger's /ledger/attest
// verifies bearers via Identity introspection (verify_token in CPC
// ledger/app/main.py) — it has NO shared-secret path. The Terminal was
// sending AGENT_SERVICE_TOKEN (a shared secret valid for /api/vault/* and
// /api/epicon/ingest, which compare by string equality), so introspection
// rejected every attest with 401. No token VALUE fixes a protocol mismatch.
//
// INTENDED DESIGN (scripts/provision_service_account.py in CPC): a robot
// identity exists at the Mobius Identity Service; "JWTs are minted at
// runtime via login." This module implements the minting half the Terminal
// never had.
//
// Behavior:
//   - If IDENTITY_SERVICE_EMAIL + IDENTITY_SERVICE_PASSWORD are configured,
//     mint an access token via POST {IDENTITY_API_BASE}/auth/login, cache it
//     (module memory + KV) and serve it for attest calls.
//   - If creds are absent, fall back to getAgentBearerToken() — current
//     behavior, graceful degradation, nothing breaks if env isn't set yet.
//   - invalidateIdentityToken() lets callers force a re-mint after a 401
//     (token expiry mid-cache-window).
//
// EPICON note: this changes only HOW the Terminal authenticates to
// /ledger/attest. Event content, EPICON criteria, and KV-first write order
// (resilientWrite) are untouched.
//
// CC0 Public Domain

import { getAgentBearerToken } from '@/lib/substrate/client';

const DEFAULT_IDENTITY_BASE = 'https://mobius-identity-service.onrender.com';
const KV_KEY = 'substrate:identity_jwt';
// Conservative cache window; tokens are re-minted well before typical JWT
// expiry. Override with IDENTITY_JWT_CACHE_SECONDS if the Identity service's
// expiry is known to be shorter.
const DEFAULT_CACHE_SECONDS = 600;

type CachedToken = { token: string; expiresAt: number };

let memoryCache: CachedToken | null = null;
let inflight: Promise<string | null> | null = null;

function identityBase(): string {
  return (process.env.IDENTITY_API_BASE ?? DEFAULT_IDENTITY_BASE).trim().replace(/\/+$/, '');
}

function cacheSeconds(): number {
  const raw = Number(process.env.IDENTITY_JWT_CACHE_SECONDS ?? DEFAULT_CACHE_SECONDS);
  return Number.isFinite(raw) && raw > 30 ? raw : DEFAULT_CACHE_SECONDS;
}

function credsConfigured(): boolean {
  return (
    (process.env.IDENTITY_SERVICE_EMAIL ?? '').trim().length > 0 &&
    (process.env.IDENTITY_SERVICE_PASSWORD ?? '').trim().length > 0
  );
}

async function readKvCache(): Promise<CachedToken | null> {
  try {
    const { kvGet } = await import('@/lib/kv/store');
    const raw = await kvGet<CachedToken | string>(KV_KEY);
    if (!raw) return null;
    // Upstash auto-deserializes JSON; tolerate both shapes (see the
    // substrate-rejection double-parse bug fixed this cycle).
    const parsed: CachedToken = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed?.token === 'string' && typeof parsed?.expiresAt === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeKvCache(entry: CachedToken): Promise<void> {
  try {
    const { kvSet } = await import('@/lib/kv/store');
    const ttl = Math.max(60, Math.floor((entry.expiresAt - Date.now()) / 1000));
    await kvSet(KV_KEY, JSON.stringify(entry), ttl);
  } catch {
    // KV unavailable — memory cache still applies for this lambda instance.
  }
}

async function mintToken(): Promise<string | null> {
  const email = (process.env.IDENTITY_SERVICE_EMAIL ?? '').trim();
  const password = (process.env.IDENTITY_SERVICE_PASSWORD ?? '').trim();
  let res: Response;
  try {
    res = await fetch(`${identityBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[identity-token] login network error:', err instanceof Error ? err.message : err);
    return null;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[identity-token] login rejected', { status: res.status, body: body.slice(0, 300) });
    return null;
  }
  const data = (await res.json().catch(() => null)) as { access_token?: string } | null;
  const token = data?.access_token?.trim() ?? '';
  if (token.length === 0) {
    console.error('[identity-token] login response missing access_token');
    return null;
  }
  const entry: CachedToken = { token, expiresAt: Date.now() + cacheSeconds() * 1000 };
  memoryCache = entry;
  await writeKvCache(entry);
  console.info('[identity-token] minted identity JWT for ledger attest', {
    base: identityBase(),
    cache_seconds: cacheSeconds(),
  });
  return token;
}

/** Force a re-mint on next call (use after a ledger 401 with a cached token). */
export function invalidateIdentityToken(): void {
  memoryCache = null;
  void (async () => {
    try {
      const { kvDel } = await import('@/lib/kv/store');
      await kvDel(KV_KEY);
    } catch {
      /* best effort */
    }
  })();
}

/**
 * Bearer for /ledger/attest. Identity JWT when service creds are configured
 * (the protocol the ledger's verify_token actually speaks); falls back to the
 * static agent token otherwise so behavior is unchanged until env is set.
 */
export async function getAttestBearerToken(): Promise<string> {
  if (!credsConfigured()) return getAgentBearerToken();

  if (memoryCache && memoryCache.expiresAt > Date.now()) return memoryCache.token;

  const kvCached = await readKvCache();
  if (kvCached && kvCached.expiresAt > Date.now()) {
    memoryCache = kvCached;
    return kvCached.token;
  }

  if (!inflight) {
    inflight = mintToken().finally(() => {
      inflight = null;
    });
  }
  const minted = await inflight;
  // If minting failed, degrade to the static token rather than sending nothing.
  return minted ?? getAgentBearerToken();
}
