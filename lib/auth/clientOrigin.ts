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

export function buildCanonicalGitHubSignInUrl(callbackPath = '/terminal'): string {
  const callback = encodeURIComponent(callbackPath);
  return `${resolveBrowserAuthOrigin()}/api/auth/signin/github?callbackUrl=${callback}`;
}
