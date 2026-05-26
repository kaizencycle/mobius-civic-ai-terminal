/**
 * OPT-01 (C-323): Thin wrapper around lib/terminal/api.ts fetchJson with
 * retry-with-backoff and per-call AbortController timeout so cold-start
 * serverless timeouts don't strand the terminal in —boot—.
 */

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE ?? process.env.NEXT_PUBLIC_TERMINAL_API_BASE
    : ''
  )?.replace(/\/$/, '') || '';

export const isLiveAPI = !!API_BASE;

const RETRY_DELAYS_MS = [0, 800, 2000];
const DEFAULT_TIMEOUT_MS = 8_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchWithRetry(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any | null> {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      if (attempt === RETRY_DELAYS_MS.length - 1) return null;
    } finally {
      clearTimeout(tid);
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchExternal(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any | null> {
  if (!API_BASE) return null;
  return fetchWithRetry(`${API_BASE}${path}`, timeoutMs);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchInternal(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any | null> {
  return fetchWithRetry(path, timeoutMs);
}
