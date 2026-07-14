// C-339 PR-C item 4: typed, zod-validated environment module.
//
// Single source of truth for the Terminal's environment surface. Replaces
// scattered, untyped `process.env.X` reads (typo-prone, undefined-at-runtime)
// with one validated, typed accessor.
//
// DESIGN NOTE (operator-truth / partial-degradation rule):
//   This module does NOT hard-fail at boot when a token is missing. The
//   Terminal intentionally degrades gracefully — e.g. getAgentBearerToken()
//   returns '' and the attest path falls back rather than crashing the whole
//   app because one optional secret is unset. Forcing a global boot-time throw
//   would regress that behavior. Instead, every var is typed with its REAL
//   optionality, and routes that genuinely require a var can opt in to a loud,
//   explicit failure via assertEnv([...]). This gives type-safety + a single
//   source of truth + fail-fast WHERE IT IS CORRECT, without inventing a hard
//   dependency the runtime never actually had.
//
// Schema mirrors .env.example 1:1 (see scripts/check-env-example.mjs, item 7).

import { z } from 'zod';

// All values are optional strings: the runtime supplies its own defaults and
// fallbacks. Booleans/numbers are read as strings and coerced by helpers so an
// empty value never throws at parse time.
const serverSchema = z.object({
  // Public bases (also readable client-side; Next inlines NEXT_PUBLIC_*)
  NEXT_PUBLIC_MOBIUS_API_BASE: z.string().optional(),
  NEXT_PUBLIC_MOBIUS_GATEWAY_URL: z.string().optional(),
  NEXT_PUBLIC_TERMINAL_API_BASE: z.string().optional(),
  NEXT_PUBLIC_SUBSTRATE_API_BASE: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
  NEXT_PUBLIC_CANONICAL_URL: z.string().optional(),
  NEXT_PUBLIC_TERMINAL_URL: z.string().optional(),
  NEXT_PUBLIC_MESH_ENABLED: z.string().optional(),
  NEXT_PUBLIC_MESH_GATEWAY_URL: z.string().optional(),
  NEXT_PUBLIC_MESH_TIMEOUT_MS: z.string().optional(),
  NEXT_PUBLIC_MESH_API_TIMEOUT_MS: z.string().optional(),
  NEXT_PUBLIC_THOUGHT_BROKER_URL: z.string().optional(),
  NEXT_PUBLIC_CIVIC_LEDGER_URL: z.string().optional(),
  NEXT_PUBLIC_GIC_INDEXER_URL: z.string().optional(),
  NEXT_PUBLIC_MIC_WALLET_URL: z.string().optional(),
  NEXT_PUBLIC_IDENTITY_URL: z.string().optional(),
  NEXT_PUBLIC_OAA_API_URL: z.string().optional(),
  NEXT_PUBLIC_LAB4_URL: z.string().optional(),
  NEXT_PUBLIC_LAB6_URL: z.string().optional(),
  NEXT_PUBLIC_LAB7_URL: z.string().optional(),

  // Substrate / ledger write path
  SUBSTRATE_WRITE_API_KEY: z.string().optional(),
  JOURNAL_CANON_SUBSTRATE_TARGET: z.string().optional(),
  SUBSTRATE_TOKEN: z.string().optional(),
  MOBIUS_INGEST_WRITE_URL: z.string().optional(),
  MOBIUS_INGEST_BEARER_TOKEN: z.string().optional(),
  MOBIUS_SERVICE_SECRET: z.string().optional(),

  // OAA sovereign memory + KV bridge
  OAA_API_BASE: z.string().optional(),
  OAA_API_BASE_URL: z.string().optional(),
  OAA_HMAC_SECRET: z.string().optional(),
  KV_BRIDGE_SECRET: z.string().optional(),
  WRITE_MODE: z.string().optional(),
  DATA_SOURCE: z.string().optional(),

  // Substrate service config (lib/substrate/client.ts)
  MOBIUS_LEDGER_URL: z.string().optional(),
  MOBIUS_GI_URL: z.string().optional(),
  MOBIUS_MIC_URL: z.string().optional(),
  MOBIUS_BROKER_URL: z.string().optional(),
  MOBIUS_OAA_URL: z.string().optional(),

  // Render aliases / agent token family
  RENDER_IDENTITY_URL: z.string().optional(),
  RENDER_MIC_URL: z.string().optional(),
  RENDER_LEDGER_URL: z.string().optional(),
  RENDER_GIC_URL: z.string().optional(),
  RENDER_THOUGHT_BROKER_URL: z.string().optional(),
  RENDER_API_KEY: z.string().optional(),
  AGENT_SERVICE_TOKEN: z.string().optional(),
  MIC_WALLET_URL: z.string().optional(),
  IDENTITY_SERVICE_URL: z.string().optional(),
  IDENTITY_API_BASE: z.string().optional(),
  IDENTITY_SERVICE_EMAIL: z.string().optional(),
  IDENTITY_SERVICE_PASSWORD: z.string().optional(),
  IDENTITY_JWT_CACHE_SECONDS: z.string().optional(),

  // Vault v2 per-sentinel secrets
  VAULT_ATLAS_SECRET_TOKEN: z.string().optional(),
  VAULT_ZEUS_SECRET_TOKEN: z.string().optional(),
  VAULT_EVE_SECRET_TOKEN: z.string().optional(),
  VAULT_JADE_SECRET_TOKEN: z.string().optional(),
  VAULT_AUREA_SECRET_TOKEN: z.string().optional(),

  // KV (Upstash REST + optional TCP Redis backup)
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  REDIS_URL: z.string().optional(),
  MOBIUS_KV_BACKUP_MIRROR: z.string().optional(),
  MOBIUS_KV_READ_FALLBACK: z.string().optional(),
  MOBIUS_KV_GI_CARRY_ALWAYS: z.string().optional(),

  // Slack agent
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  SLACK_AGENT_GITHUB_REPO: z.string().optional(),
  SLACK_AGENT_GITHUB_REF: z.string().optional(),
  SLACK_AGENT_GITHUB_BASE: z.string().optional(),
  MOBIUS_HANDBOOK_CORS_ORIGINS: z.string().optional(),

  // GitHub OAuth (next-auth)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Auto-Seal engine / CPC canon anchor base (lib/cpc/hashAnchor.ts)
  CPC_BASE_URL: z.string().optional(),
  SEAL_TOKEN: z.string().optional(),
  CIVIC_LEDGER_URL: z.string().optional(),
  KV_SOURCE_URL: z.string().optional(),
  SEAL_ISSUE_URL: z.string().optional(),

  // GitHub-federated cold tier
  GH_CACHE_OWNER: z.string().optional(),
  GH_CACHE_REPO: z.string().optional(),
  GH_CACHE_BRANCH: z.string().optional(),
  GH_CACHE_PAT: z.string().optional(),

  // Logging (lib/log.ts)
  LOG_LEVEL: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

export type Env = z.infer<typeof serverSchema>;

/** Keys the module knows about — used by the .env.example audit (item 7). */
export const KNOWN_ENV_KEYS: readonly (keyof Env)[] = Object.keys(serverSchema.shape) as (keyof Env)[];

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // safeParse never throws here (all fields optional strings); we surface a
  // structured error only if a future required/typed field is violated.
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

let cached: Env | null = null;

/** Typed, validated, memoized view of process.env. */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop: string) {
    if (cached === null) cached = parseEnv();
    return cached[prop as keyof Env];
  },
});

/**
 * Opt-in fail-fast: throw a clear, aggregated error if any of the given vars
 * is missing/empty. Use in routes/jobs that genuinely cannot operate without
 * a value — instead of failing obscurely deep in a fetch with a 401.
 */
export function assertEnv(keys: (keyof Env)[]): void {
  const missing = keys.filter((k) => {
    const v = process.env[k as string];
    return v === undefined || v.trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}
