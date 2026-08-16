import { resolveCanonicalTerminalOrigin } from '@/lib/site/canonicalUrl';

function isVercelDeploymentHost(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host.endsWith('.vercel.app') || host === 'vercel.app';
  } catch {
    return false;
  }
}

/**
 * Resolve the Auth.js base URL used for OAuth redirect_uri construction.
 *
 * GitHub OAuth Apps accept a single callback URL. The Terminal canon domain
 * (C-358) is terminal.mobius-substrate.com — never a *.vercel.app alias.
 * When Vercel sets AUTH_URL to a deployment host, fall back to the canon origin.
 */
export function resolveAuthBaseUrl(): string {
  const explicit = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.trim();
  if (explicit && !isVercelDeploymentHost(explicit)) {
    return explicit.replace(/\/$/, '');
  }
  return resolveCanonicalTerminalOrigin();
}

/** Expected GitHub OAuth App authorization callback URL for operator setup. */
export function githubOAuthCallbackUrl(): string {
  return `${resolveAuthBaseUrl()}/api/auth/callback/github`;
}
