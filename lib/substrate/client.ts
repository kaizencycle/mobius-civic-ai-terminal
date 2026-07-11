import { TERMINAL_REGISTRATION } from '@/lib/ledger';
import { log } from '@/lib/log';
import { env } from '@/lib/env';
import { getAgentBearerToken } from '@/lib/substrate/agentToken';

export type SubstrateServiceKey = 'ledger' | 'gi' | 'mic' | 'broker' | 'oaa';

export type SubstrateServiceStatus = {
  service: SubstrateServiceKey;
  url: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error?: string;
};

export type SubstrateStatusSummary = {
  timestamp: string;
  services: SubstrateServiceStatus[];
};

type ServiceConfig = Record<SubstrateServiceKey, string>;

export function getSubstrateServiceConfig(): ServiceConfig {
  return {
    ledger: env.MOBIUS_LEDGER_URL || 'http://localhost:3000',
    gi: env.MOBIUS_GI_URL || 'http://localhost:3001',
    mic: env.MOBIUS_MIC_URL || 'http://localhost:4002',
    broker: env.MOBIUS_BROKER_URL || 'http://localhost:4005',
    oaa: env.MOBIUS_OAA_URL || 'http://localhost:3004',
  };
}

function healthPathFor(service: SubstrateServiceKey) {
  switch (service) {
    case 'ledger':
    case 'gi':
    case 'mic':
    case 'broker':
    case 'oaa':
      return '/health';
  }
}

export async function probeSubstrateService(
  service: SubstrateServiceKey,
  baseUrl: string,
): Promise<SubstrateServiceStatus> {
  const start = Date.now();
  const healthPath = healthPathFor(service);

  try {
    const response = await fetch(`${baseUrl}${healthPath}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return {
      service,
      url: `${baseUrl}${healthPath}`,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - start,
      error: response.ok ? undefined : `Health probe failed (${response.status})`,
    };
  } catch (error) {
    return {
      service,
      url: `${baseUrl}${healthPath}`,
      ok: false,
      status: null,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

export async function getSubstrateStatusSummary(): Promise<SubstrateStatusSummary> {
  const config = getSubstrateServiceConfig();
  const services = await Promise.all(
    (Object.keys(config) as SubstrateServiceKey[]).map((service) =>
      probeSubstrateService(service, config[service]),
    ),
  );

  return {
    timestamp: new Date().toISOString(),
    services,
  };
}

export type LabId = 'oaa' | 'reflections' | 'shield' | 'hive' | 'jade';

const LAB_PATHS: Record<LabId, string> = {
  oaa: '/lab/oaa',
  reflections: '/lab/reflections',
  shield: '/lab/shield',
  hive: '/lab/hive',
  jade: '/lab/jade',
};

export function getLabLaunchUrl(labId: LabId): string {
  const base = process.env.MOBIUS_SHELL_URL || 'http://localhost:3002';
  return `${base}${LAB_PATHS[labId]}`;
}

function normalizeLedgerBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Resolve the substrate ledger base URL.
 * Priority:
 *   1. RENDER_LEDGER_URL (direct Render endpoint — correct flow)
 *   2. CIVIC_LEDGER_URL (alias)
 *   3. NEXT_PUBLIC_SUBSTRATE_API_BASE if it looks like a Render/civic-protocol URL
 *   4. Hardcoded Render fallback
 *
 * GitHub URLs (github.com or api.github.com) are intentionally skipped — the terminal
 * POSTs to the Civic Protocol Core Ledger on Render, which then writes to the Substrate
 * GitHub repo. Direct writes to GitHub always 404.
 */
export function resolveSubstrateLedgerUrl(): string {
  const candidates = [
    process.env.RENDER_LEDGER_URL,
    process.env.CIVIC_LEDGER_URL,
    process.env.NEXT_PUBLIC_SUBSTRATE_API_BASE,
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    const normalized = normalizeLedgerBaseUrl(url);
    if (normalized.includes('github.com') || normalized.includes('api.github.com')) {
      console.error(
        '[substrate] CRITICAL: env var points to GitHub, not the Civic Protocol Ledger.',
        'Set RENDER_LEDGER_URL=https://civic-protocol-core-ledger.onrender.com',
        'Skipping:', normalized,
      );
      continue;
    }
    if (normalized.includes('onrender.com') || normalized.includes('civic-protocol') || normalized.startsWith('http')) {
      log.info('[substrate] using ledger URL:', normalized);
      return normalized;
    }
  }

  const fallback = 'https://civic-protocol-core-ledger.onrender.com';
  console.warn('[substrate] no valid ledger URL in env, using hardcoded fallback:', fallback);
  return fallback;
}

/**
 * FIX-19: Single source of truth for terminal identity fields required by the Render ledger.
 * Import and spread into any payload builder that writes to the Civic Protocol Ledger.
 * Resolves at call-time so env vars set after module load are picked up.
 */
export function getTerminalRegistration(): { terminal_id: string; api_base: string } {
  return {
    terminal_id: TERMINAL_REGISTRATION.terminal_id,
    api_base: TERMINAL_REGISTRATION.api_base,
  };
}

/** JWT for Civic Protocol ledger + MIC (identity login). Falls back to legacy RENDER_API_KEY. */
// C-339 PR-C item 15: implementation extracted to lib/substrate/agentToken.ts
// (dependency-free, unit-testable); re-exported here so existing importers of
// '@/lib/substrate/client' are unaffected.
export { getAgentBearerToken };

function compactLedgerBody(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 900);
}

type LedgerLabSource = 'oaa' | 'reflections' | 'shield' | 'hive' | 'jade' | 'terminal';

function toLedgerLabSource(source: SubstrateEntry['source']): LedgerLabSource {
  switch (source) {
    case 'agent-journal':
    case 'eve-synthesis':
    case 'atlas-heartbeat':
    case 'zeus-verify':
    case 'aurea-close':
    case 'echo-ingest':
    case 'epicon-promotion':
    case 'eve-shard-candidate':
    case 'seed-backfill':
      return 'terminal';
  }
}

async function persistLastLedgerRejection(debug: Record<string, unknown>): Promise<void> {
  try {
    const { kvSet } = await import('@/lib/kv/store');
    await kvSet('substrate:last_rejection', JSON.stringify({ ...debug, ts: new Date().toISOString() }), 86400);
  } catch {
    // diagnostic-only; never fail the write path because debug persistence failed
  }
}

const SUBMITTED_IDS_KEY = 'substrate:submitted_ids';
const SUBMITTED_IDS_CAP = 500;

async function isAlreadySubmitted(eventId: string): Promise<boolean> {
  try {
    const { kvGet } = await import('@/lib/kv/store');
    const submitted = await kvGet<string[]>(SUBMITTED_IDS_KEY) ?? [];
    return submitted.includes(eventId);
  } catch {
    return false;
  }
}

async function markSubmitted(eventId: string): Promise<void> {
  try {
    const { kvGet, kvSet } = await import('@/lib/kv/store');
    const submitted = await kvGet<string[]>(SUBMITTED_IDS_KEY) ?? [];
    if (!submitted.includes(eventId)) {
      const updated = [eventId, ...submitted].slice(0, SUBMITTED_IDS_CAP);
      await kvSet(SUBMITTED_IDS_KEY, updated, 86400);
    }
  } catch {
    // diagnostic-only
  }
}

export interface SubstrateEntry {
  id?: string;
  timestamp?: string;
  agent: string;
  agentOrigin: string;
  cycle: string;
  title: string;
  summary: string;
  category:
    | 'market'
    | 'geopolitical'
    | 'infrastructure'
    | 'narrative'
    | 'governance'
    | 'ethics'
    | 'civic-risk'
    | 'observation'
    | 'inference'
    | 'alert'
    | 'recommendation'
    | 'close'
    | 'heartbeat'
    | 'verification'
    | 'ingest';
  severity: 'nominal' | 'elevated' | 'critical' | 'info' | 'degraded';
  source:
    | 'agent-journal'
    | 'eve-synthesis'
    | 'atlas-heartbeat'
    | 'zeus-verify'
    | 'aurea-close'
    | 'echo-ingest'
    | 'epicon-promotion'
    | 'eve-shard-candidate'
    | 'seed-backfill';
  gi_at_time?: number;
  confidence?: number;
  derivedFrom?: string[];
  tags?: string[];
  verified?: boolean;
  attestation_signature?: unknown;
}

export type AttestToLedgerResult = { ok: boolean; entryId?: string; error?: string };

/**
 * Write a civic ledger attestation (Civic Protocol Core) and optionally trigger MIC earn (fire-and-forget).
 * C-300: Added graceful degradation when SUBSTRATE_API_BASE is not configured.
 */
export async function attestToLedger(entry: SubstrateEntry): Promise<AttestToLedgerResult> {
  const LEDGER_BASE = resolveSubstrateLedgerUrl();
  // C-338: /ledger/attest verifies via Identity introspection — mint a runtime
  // JWT (falls back to the static agent token when creds are unconfigured).
  const { getAttestBearerToken } = await import('@/lib/substrate/identityToken');
  let AGENT_TOKEN = await getAttestBearerToken();
  let authorization = AGENT_TOKEN.length > 0 ? `Bearer ${AGENT_TOKEN}` : '';
  const eventId = entry.id ?? `${entry.agentOrigin}-${entry.cycle}-${Date.now()}`;
  const attestTimestamp = new Date().toISOString();
  const ledgerLabSource = toLedgerLabSource(entry.source);
  // FIX-506-02 / C-314 T-04: terminal identity via TERMINAL_REGISTRATION (lib/ledger.ts).
  const { terminal_id, api_base } = TERMINAL_REGISTRATION;

  const requestBody = {
    event_type: entry.category,
    // C-338: the ledger binds civic_id to the introspected JWT
    // (_civic_id_allowed_for_lab in CPC ledger/app/main.py) — for
    // lab_source "terminal" only mobius-* synthetic ids are exempt from
    // exact-match. Agent-prefixed ids (ATLAS-C-338-…) would 403 the moment
    // auth starts succeeding. payload.event_id keeps the raw id for
    // cross-referencing; only the ledger-facing civic_id is prefixed.
    civic_id: eventId.startsWith('mobius-') ? eventId : `mobius-${eventId}`,
    lab_source: ledgerLabSource,
    terminal_base_url: api_base,
    api_base,
    terminal_id,
    payload: {
      event_id: eventId,
      title: entry.title,
      summary: entry.summary,
      cycle: entry.cycle,
      gi_at_time: entry.gi_at_time,
      mii: entry.confidence,
      severity: entry.severity,
      source: entry.source,
      terminal_source: entry.source,
      ledger_lab_source: ledgerLabSource,
      tags: Array.from(new Set([...(entry.tags ?? []), `source:${entry.source}`])),
      agent: entry.agent,
      agent_id: entry.agentOrigin.toLowerCase(),
      agent_origin: entry.agentOrigin,
      derived_from: entry.derivedFrom ?? [],
      verified: entry.verified ?? false,
      attestation_signature: entry.attestation_signature ?? null,
      attested_at: attestTimestamp,
    },
  };

  // Deduplication guard: skip re-attestation for entries already successfully submitted.
  if (await isAlreadySubmitted(eventId)) {
    log.info('[sweep] journal entry already attested, skipping:', eventId);
    return { ok: true, entryId: eventId };
  }

  try {
    // C-296 OPT-3: removed pre-flight /health probe — it doubled the RTT to Render
    // on every write with no recovery value (the attest call itself surfaces failures).
    // Canonical Civic-Protocol-Core endpoint paths:
    //   POST /ledger/attest, GET /ledger/chain
    //   POST /api/vault/seal, POST /api/seal/reconcile, POST /api/epicon/ingest
    let res = await fetch(`${LEDGER_BASE}/ledger/attest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
        ...(terminal_id ? { 'X-Terminal-ID': terminal_id } : {}),
        ...(api_base ? { 'X-Terminal-API-Base': api_base } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    // C-357: one retry after 401 — await cache clear, bypass KV, re-mint, re-attest.
    if (res.status === 401) {
      const { invalidateIdentityToken, getAttestBearerToken: remint } = await import(
        '@/lib/substrate/identityToken'
      );
      await invalidateIdentityToken();
      AGENT_TOKEN = await remint({ bypassCache: true });
      authorization = AGENT_TOKEN.length > 0 ? `Bearer ${AGENT_TOKEN}` : '';
      if (authorization) {
        res = await fetch(`${LEDGER_BASE}/ledger/attest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authorization,
            ...(terminal_id ? { 'X-Terminal-ID': terminal_id } : {}),
            ...(api_base ? { 'X-Terminal-API-Base': api_base } : {}),
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(8000),
          cache: 'no-store',
        });
      }
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const detail = compactLedgerBody(body);
      const safeDebug = {
        status: res.status,
        contentType,
        event_type: requestBody.event_type,
        civic_id: requestBody.civic_id,
        lab_source: requestBody.lab_source,
        terminal_source: entry.source,
        payload_keys: Object.keys(requestBody.payload),
        tags: requestBody.payload.tags,
        response: detail,
      };
      const hint = detail.includes('No API base configured for terminal')
        ? 'Add TERMINAL_ID + TERMINAL_API_BASE to Vercel env vars (FIX-20)'
        : undefined;
      console.warn('[substrate] ledger attest rejected', { ...safeDebug, hint });
      await persistLastLedgerRejection(safeDebug);
      if (res.status === 401) {
        // C-338: cached identity JWT may have expired mid-window — force a
        // re-mint so the next cron tick attests with a fresh token.
        const { invalidateIdentityToken } = await import('@/lib/substrate/identityToken');
        await invalidateIdentityToken();
      }
      throw new Error(`ledger ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    // C-296 OPT-2: guard Content-Type before JSON.parse — Render cold-starts
    // return HTML (<!doctype …>) which throws SyntaxError and causes a 500.
    if (!contentType.includes('application/json')) {
      throw new Error(`ledger response not JSON (content-type: ${contentType})`);
    }
    const data = (await res.json()) as { id?: string; event_id?: string };
    const entryId = data.event_id ?? data.id ?? eventId;
    console.info('[substrate] ledger attest confirmed', {
      civic_id: requestBody.civic_id,
      entry_id: entryId,
      terminal_id,
      api_base: api_base,
    });
    // C-338 Codex review: dedupe is keyed on the raw eventId (isAlreadySubmitted
    // above checks eventId, not the mobius-prefixed civic_id the ledger may echo
    // back as entryId) — mark the raw id submitted so re-attest is actually skipped.
    void markSubmitted(eventId);

    const MIC_URL = (process.env.MIC_WALLET_URL ?? process.env.RENDER_MIC_URL ?? '').trim();
    // C-338 Codex review: keep MIC earn on the static service token — the
    // minted Identity JWT (AGENT_TOKEN above) is for /ledger/attest only.
    const MIC_TOKEN = getAgentBearerToken();
    if (MIC_URL.length > 0 && MIC_TOKEN.length > 0) {
      void fetch(`${MIC_URL.replace(/\/+$/, '')}/mic/earn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MIC_TOKEN}`,
        },
        body: JSON.stringify({
          source: 'agent_epicon_attest',
          mii: entry.confidence ?? 0.85,
          metadata: {
            agent: entry.agentOrigin,
            cycle: entry.cycle,
            category: entry.category,
          },
        }),
        signal: AbortSignal.timeout(8000),
      }).catch((err: unknown) => {
        console.error('[mic] earn failed:', err);
      });
    }

    return { ok: true, entryId };
  } catch (err) {
    await writeJournalToKV(entry);
    return { ok: false, error: String(err) };
  }
}

const JOURNAL_VALID_CATEGORIES = new Set(['observation', 'inference', 'alert', 'recommendation', 'close']);

function toJournalCategory(cat: string): string {
  return JOURNAL_VALID_CATEGORIES.has(cat) ? cat : 'observation';
}

async function writeJournalToKV(entry: SubstrateEntry): Promise<void> {
  const { getJournalRedisClient } = await import('@/lib/agents/journalLane');
  const redis = getJournalRedisClient();
  if (!redis) return;

  const now = new Date().toISOString();
  const cycle = entry.cycle;
  const agentUpper = entry.agentOrigin.toUpperCase();
  const safeCategory = toJournalCategory(entry.category);
  const record = {
    id: `${entry.agentOrigin}-${entry.cycle}-${Date.now()}`,
    agent: entry.agent,
    cycle,
    timestamp: now,
    scope: safeCategory,
    observation: entry.summary,
    inference: entry.title,
    recommendation: entry.title,
    confidence: entry.confidence ?? 0.5,
    derivedFrom: entry.derivedFrom ?? [],
    status: 'committed',
    category: safeCategory,
    severity: entry.severity,
    source: 'agent-journal',
    agentOrigin: entry.agentOrigin,
    tags: entry.tags ?? [],
  };

  await redis.set(`journal:${agentUpper}:${cycle}`, JSON.stringify(record), { ex: 604800 });
}

export async function writeToSubstrate(
  entry: SubstrateEntry,
): Promise<{ ok: boolean; entryId?: string; error?: string }> {
  const withTimestamp: SubstrateEntry = {
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  };
  return attestToLedger(withTimestamp);
}
