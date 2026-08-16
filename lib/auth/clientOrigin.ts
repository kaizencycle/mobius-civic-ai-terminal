const DEFAULT_CANON = 'https://terminal.mobius-substrate.com';

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

/** Auth.js v5 starts OAuth via POST + CSRF — never GET /api/auth/signin/github directly. */
export function buildOAuthHandoffUrl(origin: string, callbackPath = '/terminal'): string {
  const callback = encodeURIComponent(callbackPath);
  return `${origin.replace(/\/$/, '')}/terminal/globe?oauth=login&callbackUrl=${callback}`;
}

/** Redirect *.vercel.app operators to canon terminal to run signIn() with CSRF. */
export function buildCanonicalOAuthHandoffUrl(callbackPath = '/terminal'): string {
  return buildOAuthHandoffUrl(resolveBrowserAuthOrigin(), callbackPath);
}
