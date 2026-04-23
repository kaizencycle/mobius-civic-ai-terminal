/**
 * CORS for public Handbook / proof UIs (e.g. GitHub Pages) calling read-only Terminal APIs.
 *
 * Configure extra origins via MOBIUS_HANDBOOK_CORS_ORIGINS (comma-separated full origins).
 */

const DEFAULT_ALLOWED = [
  'https://mobius-browser-shell.vercel.app',
  'https://kaizencycle.github.io',
] as const;

function allowedOrigins(): Set<string> {
  const set = new Set<string>(DEFAULT_ALLOWED);
  const raw = process.env.MOBIUS_HANDBOOK_CORS_ORIGINS?.trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const o = part.trim();
      if (o) set.add(o);
    }
  }
  return set;
}

/**
 * Returns CORS headers when the request `Origin` is allowlisted; otherwise undefined.
 */
export function handbookCorsHeaders(origin: string | null): Record<string, string> | undefined {
  if (!origin) return undefined;
  if (!allowedOrigins().has(origin)) return undefined;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
