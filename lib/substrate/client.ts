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
    ledger: process.env.MOBIUS_LEDGER_URL || 'http://localhost:3000',
    gi: process.env.MOBIUS_GI_URL || 'http://localhost:3001',
    mic: process.env.MOBIUS_MIC_URL || 'http://localhost:4002',
    broker: process.env.MOBIUS_BROKER_URL || 'http://localhost:4005',
    oaa: process.env.MOBIUS_OAA_URL || 'http://localhost:3004',
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
    const response = await fetch(`${baseUrl}${healthPath}`, { cache: 'no-store' });
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

/** JWT for Civic Protocol ledger + MIC (identity login). Falls back to legacy RENDER_API_KEY. */
export function getAgentBearerToken(): string {
  const primary = process.env.AGENT_SERVICE_TOKEN?.trim() ?? '';
  if (primary.length > 0) return primary;
  return process.env.RENDER_API_KEY?.trim() ?? '';
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
    | 'seed-backfill';
  gi_at_time?: number;
  confidence?: number;
  derivedFrom?: string[];
  tags?: string[];
  verified?: boolean;
}

export type AttestToLedgerResult = { ok: boolean; entryId?: string; error?: string };

/**
 * Write a civic ledger attestation (Civic Protocol Core) and optionally trigger MIC earn (fire-and-forget).
 */
export async function attestToLedger(entry: SubstrateEntry): Promise<AttestToLedgerResult> {
  const LEDGER_BASE = normalizeLedgerBaseUrl(
    process.env.RENDER_LEDGER_URL ?? 'https://civic-protocol-core-ledger.onrender.com',
  );
  const AGENT_TOKEN = getAgentBearerToken();
  const authorization = AGENT_TOKEN.length > 0 ? `Bearer ${AGENT_TOKEN}` : '';
  const eventId = entry.id ?? `${entry.agentOrigin}-${entry.cycle}-${Date.now()}`;
  const attestTimestamp = new Date().toISOString();

  try {
    const health = await fetch(`${LEDGER_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!health.ok) throw new Error(`ledger health ${health.status}`);

    const res = await fetch(`${LEDGER_BASE}/ledger/attest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({
        agent_id: entry.agentOrigin.toLowerCase(),
        event_type: entry.category,
        civic_id: `mobius-${entry.agentOrigin.toLowerCase()}`,
        lab_source: entry.source,
        payload: {
          event_id: eventId,
          title: entry.title,
          summary: entry.summary,
          cycle: entry.cycle,
          gi_at_time: entry.gi_at_time,
          mii: entry.confidence,
          severity: entry.severity,
          source: entry.source,
          tags: entry.tags ?? [],
          agent: entry.agent,
          agent_origin: entry.agentOrigin,
          derived_from: entry.derivedFrom ?? [],
          verified: entry.verified ?? false,
        },
        timestamp: attestTimestamp,
      }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`ledger ${res.status}`);
    const data = (await res.json()) as { id?: string; event_id?: string };
    const entryId = data.event_id ?? data.id ?? eventId;

    const MIC_URL = (process.env.MIC_WALLET_URL ?? process.env.RENDER_MIC_URL ?? '').trim();
    if (MIC_URL.length > 0 && AGENT_TOKEN.length > 0) {
      void fetch(`${MIC_URL.replace(/\/+$/, '')}/mic/earn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AGENT_TOKEN}`,
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

async function writeJournalToKV(entry: SubstrateEntry): Promise<void> {
  const { getJournalRedisClient } = await import('@/lib/agents/journalLane');
  const redis = getJournalRedisClient();
  if (!redis) return;

  const now = new Date().toISOString();
  const cycle = entry.cycle;
  const agentUpper = entry.agentOrigin.toUpperCase();
  const record = {
    id: `${entry.agentOrigin}-${entry.cycle}-${Date.now()}`,
    agent: entry.agent,
    cycle,
    timestamp: now,
    scope: entry.category,
    observation: entry.summary,
    inference: entry.title,
    recommendation: entry.title,
    confidence: entry.confidence ?? 0.5,
    derivedFrom: entry.derivedFrom ?? [],
    status: 'committed',
    category: entry.category,
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
