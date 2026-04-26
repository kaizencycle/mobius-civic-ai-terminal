import { timingSafeEqual } from 'node:crypto';
import type { SentinelAgent } from '@/lib/vault-v2/types';

const VAULT_AGENT_ENV: Record<SentinelAgent, string> = {
  ATLAS: 'VAULT_ATLAS_SECRET_TOKEN',
  ZEUS: 'VAULT_ZEUS_SECRET_TOKEN',
  EVE: 'VAULT_EVE_SECRET_TOKEN',
  JADE: 'VAULT_JADE_SECRET_TOKEN',
  AUREA: 'VAULT_AUREA_SECRET_TOKEN',
};

/**
 * Resolves the HMAC/bearer secret for Vault v2 Seal attestations for a given
 * sentinel. Prefers `VAULT_*_SECRET_TOKEN`; falls back to `AGENT_SERVICE_TOKEN`
 * during migration when a per-sentinel secret is unset.
 */
export function getVaultAttestationToken(agent: SentinelAgent): string {
  const specificKey = VAULT_AGENT_ENV[agent];
  const specificToken = process.env[specificKey];
  if (typeof specificToken === 'string' && specificToken.length > 0) {
    return specificToken;
  }
  return process.env.AGENT_SERVICE_TOKEN ?? '';
}

export function bearerMatchesToken(authHeader: string | null, token: string): boolean {
  if (!token) return false;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  // OPT-10 (C-293): length pre-check is a timing shortcut that leaks token length.
  // For a true constant-time comparison, pad both buffers to the same length
  // before the timingSafeEqual call. The early-return on empty bearer is kept
  // because an empty input is never a valid token and reveals nothing useful.
  if (!bearer) return false;
  try {
    const bBuf = Buffer.from(bearer, 'utf8');
    const tBuf = Buffer.from(token, 'utf8');
    if (bBuf.length !== tBuf.length) return false; // lengths must match for timingSafeEqual
    return timingSafeEqual(bBuf, tBuf);
  } catch {
    return false;
  }
}
