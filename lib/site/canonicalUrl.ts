/** Canonical public origin — never use VERCEL_URL or preview deployment hosts. */
const DEFAULT_ORIGIN = 'https://terminal.mobius-substrate.com';

function normalizeOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/$/, '');
}

/** Vercel preview/production aliases must not win over the public canon domain. */
function isVercelDeploymentHost(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host.endsWith('.vercel.app') || host === 'vercel.app';
  } catch {
    return false;
  }
}

/**
 * Resolve the SEO/metadata canonical origin.
 * Priority: CANONICAL_URL → SITE_URL (if not Vercel) → default canon domain.
 */
export function resolveCanonicalTerminalOrigin(): string {
  const canonical = normalizeOrigin(process.env.NEXT_PUBLIC_CANONICAL_URL);
  if (canonical) return canonical;

  const site = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (site && !isVercelDeploymentHost(site)) return site;

  return DEFAULT_ORIGIN;
}

export const CANONICAL_TERMINAL_ORIGIN = resolveCanonicalTerminalOrigin();
