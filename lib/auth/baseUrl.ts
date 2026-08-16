import {
  isVercelDeploymentHost,
  normalizeOrigin,
  resolveCanonicalTerminalOrigin,
} from '@/lib/site/canonicalUrl';

function isLocalDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Resolve the Auth.js base URL used for OAuth redirect_uri construction.
 *
 * GitHub OAuth Apps accept a single callback URL. Production uses the canon
 * domain (C-358). Local dev honors NEXT_PUBLIC_SITE_URL even when
 * NEXT_PUBLIC_CANONICAL_URL points at production (.env.example pattern).
 */
export function resolveAuthBaseUrl(): string {
  const explicit = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();
  if (explicit && !isVercelDeploymentHost(explicit)) {
    return explicit.replace(/\/$/, '');
  }

  const site = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (site && isLocalDevOrigin(site)) {
    return site;
  }

  return resolveCanonicalTerminalOrigin();
}

/** Expected GitHub OAuth App authorization callback URL for operator setup. */
export function githubOAuthCallbackUrl(): string {
  return `${resolveAuthBaseUrl()}/api/auth/callback/github`;
}

/**
 * OAuth state/PKCE cookies are host-scoped. When a sign-in starts on a
 * *.vercel.app alias, redirect to the canon host before Auth.js runs so
 * cookies and redirect_uri share the same origin.
 */
export function resolveAuthAliasRedirectUrl(requestUrl: URL): URL | null {
  if (!isVercelDeploymentHost(requestUrl.origin)) {
    return null;
  }
  if (!requestUrl.pathname.startsWith('/api/auth')) {
    return null;
  }
  const canonical = resolveAuthBaseUrl();
  if (requestUrl.origin === canonical) {
    return null;
  }
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, canonical);
}
