// C-338 — Runtime Identity JWT minting for ledger attestation.
// C-357 — Wake + retry for Render cold starts; no AGENT_SERVICE_TOKEN fallback
// when identity creds are configured (that fallback guaranteed 401 introspect).
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
//   - Wake the identity service (/health) before login to survive Render free-tier
//     cold starts; retry login with exponential backoff.
//   - If creds are configured but minting fails, return empty string — never
//     fall back to AGENT_SERVICE_TOKEN (introspect rejects it every time).
//   - If creds are absent, fall back to getAgentBearerToken() — graceful
//     degradation until env is provisioned.
//   - invalidateIdentityToken() clears memory + KV before re-mint after a 401.
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
const MINT_MAX_ATTEMPTS = 3;
const WAKE_DELAY_MS = 2000;

type CachedToken = { token: string; expiresAt: number };

let memoryCache: CachedToken | null = null;
let inflight: Promise<string | null> | null = null;

function identityBase(): string {
  const fromEnv = (
    process.env.IDENTITY_API_BASE ??
    process.env.IDENTITY_SERVICE_URL ??
    process.env.RENDER_IDENTITY_URL ??
    DEFAULT_IDENTITY_BASE
  )
    .trim()
    .replace(/\/+$/, '');
  return fromEnv.length > 0 ? fromEnv : DEFAULT_IDENTITY_BASE;
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

/** True when Vercel has service-account creds for runtime JWT minting. */
export function isIdentityServiceConfigured(): boolean {
  return credsConfigured();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ping identity service health to wake Render free-tier instances before login. */
async function wakeIdentityService(): Promise<void> {
  const base = identityBase();
  try {
    await fetch(`${base}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });
  } catch {
    // Best effort — login retry handles remaining cold-start latency.
  }
  await sleep(WAKE_DELAY_MS);
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

async function loginOnce(email: string, password: string): Promise<string | null> {
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
  return token;
}

async function mintToken(): Promise<string | null> {
  const email = (process.env.IDENTITY_SERVICE_EMAIL ?? '').trim();
  const password = (process.env.IDENTITY_SERVICE_PASSWORD ?? '').trim();

  await wakeIdentityService();

  for (let attempt = 1; attempt <= MINT_MAX_ATTEMPTS; attempt++) {
    const token = await loginOnce(email, password);
    if (token) {
      const entry: CachedToken = { token, expiresAt: Date.now() + cacheSeconds() * 1000 };
      memoryCache = entry;
      await writeKvCache(entry);
      console.info('[identity-token] minted identity JWT for ledger attest', {
        base: identityBase(),
        cache_seconds: cacheSeconds(),
        attempt,
      });
      return token;
    }
    if (attempt < MINT_MAX_ATTEMPTS) {
      const backoffMs = 1000 * 2 ** (attempt - 1);
      console.warn('[identity-token] login failed, retrying', { attempt, backoff_ms: backoffMs });
      await sleep(backoffMs);
      await wakeIdentityService();
    }
  }

  console.error('[identity-token] all login attempts failed — attest will 401 if AGENT_SERVICE_TOKEN is used');
  return null;
}

/** Force a re-mint on next call (use after a ledger 401 with a cached token). */
export async function invalidateIdentityToken(): Promise<void> {
  memoryCache = null;
  inflight = null;
  try {
    const { kvDel } = await import('@/lib/kv/store');
    await kvDel(KV_KEY);
  } catch {
    /* best effort */
  }
}

export type AttestBearerOptions = {
  /** Skip memory/KV cache and mint a fresh JWT (use after invalidateIdentityToken). */
  bypassCache?: boolean;
};

/**
 * Bearer for /ledger/attest. Identity JWT when service creds are configured
 * (the protocol the ledger's verify_token actually speaks); falls back to the
 * static agent token only when identity creds are absent.
 */
export async function getAttestBearerToken(options?: AttestBearerOptions): Promise<string> {
  if (!credsConfigured()) {
    console.warn(
      '[identity-token] IDENTITY_SERVICE_EMAIL/PASSWORD unset — using AGENT_SERVICE_TOKEN (introspect will 401)',
    );
    return getAgentBearerToken();
  }

  const bypassCache = options?.bypassCache === true;

  if (!bypassCache && memoryCache && memoryCache.expiresAt > Date.now()) {
    return memoryCache.token;
  }

  if (!bypassCache) {
    const kvCached = await readKvCache();
    if (kvCached && kvCached.expiresAt > Date.now()) {
      memoryCache = kvCached;
      return kvCached.token;
    }
  }

  if (!inflight) {
    inflight = mintToken().finally(() => {
      inflight = null;
    });
  }
  const minted = await inflight;
  // C-357: creds are configured — never send AGENT_SERVICE_TOKEN to introspect.
  return minted ?? '';
}
