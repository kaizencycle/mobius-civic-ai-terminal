const DEFAULT_CANON = 'https://terminal.mobius-substrate.com';
export const DEFAULT_OAUTH_CALLBACK = '/terminal/globe';

export function isVercelBrowserHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith('.vercel.app') || host === 'vercel.app';
}

/** Browser-side auth origin — alias hosts must start OAuth on the canon domain. */
export function resolveBrowserAuthOrigin(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_CANON;
  }
  if (!isVercelBrowserHost(window.location.hostname)) {
    return window.location.origin;
  }
  const canonical = process.env.NEXT_PUBLIC_CANONICAL_URL?.trim().replace(/\/$/, '');
  return canonical || DEFAULT_CANON;
}

/** Allow only `/terminal` or `/terminal/...` chamber routes — not `/terminalfoo`. */
export function isAllowedTerminalCallbackPathname(pathname: string): boolean {
  return pathname === '/terminal' || pathname.startsWith('/terminal/');
}

/**
 * Auth.js callbackUrl must be a safe same-origin terminal path without oauth
 * handoff params — crafted values can otherwise re-trigger signIn in a loop.
 */
export function sanitizeOAuthCallbackUrl(raw: string | null | undefined): string {
  const fallback = DEFAULT_OAUTH_CALLBACK;
  if (!raw?.trim()) return fallback;

  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return fallback;
  }

  if (/^https?:\/\//i.test(decoded) || decoded.startsWith('//')) {
    return fallback;
  }
  if (/oauth\s*=/i.test(decoded) || /callbackUrl\s*=/i.test(decoded)) {
    return fallback;
  }

  try {
    const parsed = new URL(decoded, 'http://oauth-callback.local');
    if (!isAllowedTerminalCallbackPathname(parsed.pathname)) {
      return fallback;
    }
    parsed.searchParams.delete('oauth');
    parsed.searchParams.delete('callbackUrl');
    const path = `${parsed.pathname}${parsed.search}`;
    if (!isAllowedTerminalCallbackPathname(parsed.pathname) || /oauth\s*=/i.test(path)) {
      return fallback;
    }
    return path;
  } catch {
    return fallback;
  }
}

/** Auth.js v5 starts OAuth via POST + CSRF — never GET /api/auth/signin/github directly. */
export function buildOAuthHandoffUrl(origin: string, callbackPath = DEFAULT_OAUTH_CALLBACK): string {
  const safeCallback = sanitizeOAuthCallbackUrl(callbackPath);
  const callback = encodeURIComponent(safeCallback);
  return `${origin.replace(/\/$/, '')}/terminal/globe?oauth=login&callbackUrl=${callback}`;
}

/** Redirect *.vercel.app operators to canon terminal to run signIn() with CSRF. */
export function buildCanonicalOAuthHandoffUrl(callbackPath = DEFAULT_OAUTH_CALLBACK): string {
  return buildOAuthHandoffUrl(resolveBrowserAuthOrigin(), callbackPath);
}
