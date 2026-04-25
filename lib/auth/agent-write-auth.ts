import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

const WRITE_TOKEN_ENVS = ['AGENT_SERVICE_TOKEN', 'CRON_SECRET', 'MOBIUS_WRITE_TOKEN'] as const;

function configuredWriteTokens(): string[] {
  return WRITE_TOKEN_ENVS
    .map((key) => process.env[key]?.trim())
    .filter((value): value is string => Boolean(value));
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function hasConfiguredWriteToken(): boolean {
  return configuredWriteTokens().length > 0;
}

export function verifyWriteToken(candidate?: string | null): boolean {
  if (!candidate) return false;
  const tokens = configuredWriteTokens();
  if (tokens.length === 0) return false;
  const candidateDigest = digest(candidate.trim());
  return tokens.some((token) => timingSafeEqual(candidateDigest, digest(token)));
}

export function extractWriteToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return (
    req.headers.get('x-agent-service-token') ??
    req.headers.get('x-cron-secret') ??
    req.headers.get('x-mobius-write-token')
  );
}

export function requireWriteAuth(req: NextRequest): { ok: true } | { ok: false; status: number; code: string } {
  if (!hasConfiguredWriteToken()) {
    return { ok: false, status: 503, code: 'write_auth_not_configured' };
  }
  if (!verifyWriteToken(extractWriteToken(req))) {
    return { ok: false, status: 401, code: 'write_auth_required' };
  }
  return { ok: true };
}

export function internalWriteAuthHeaders(): Record<string, string> {
  const token = configuredWriteTokens()[0];
  return token ? { Authorization: `Bearer ${token}` } : {};
}
