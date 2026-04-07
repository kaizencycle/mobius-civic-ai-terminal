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


export interface SubstrateEntry {
  agent: string;
  agentOrigin: string;
  cycle: string;
  title: string;
  summary: string;
  category:
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
  source: 'agent-journal' | 'eve-synthesis' | 'atlas-heartbeat' | 'zeus-verify' | 'aurea-close' | 'echo-ingest';
  gi_at_time?: number;
  confidence?: number;
  derivedFrom?: string[];
  tags?: string[];
  verified?: boolean;
}

async function writeJournalToKV(entry: SubstrateEntry): Promise<void> {
  const { getJournalRedisClient } = await import('@/lib/agents/journalLane');
  const redis = getJournalRedisClient();
  if (!redis) return;

  const now = new Date().toISOString();
  const record = {
    id: `${entry.agentOrigin}-${entry.cycle}-${Date.now()}`,
    agent: entry.agent,
    cycle: entry.cycle,
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

  await redis.lpush(`journal:${entry.agentOrigin.toLowerCase()}`, JSON.stringify(record));
  await redis.ltrim(`journal:${entry.agentOrigin.toLowerCase()}`, 0, 199);
  await redis.lpush('journal:all', JSON.stringify(record));
  await redis.ltrim('journal:all', 0, 499);
}

export async function writeToSubstrate(
  entry: SubstrateEntry,
): Promise<{ ok: boolean; entryId?: string; error?: string }> {
  const ledgerUrl = process.env.RENDER_LEDGER_URL ?? 'https://civic-protocol-core.onrender.com';
  const apiKey = process.env.RENDER_API_KEY ?? '';

  try {
    const res = await fetch(`${ledgerUrl}/ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'X-Agent-Origin': entry.agentOrigin,
      },
      body: JSON.stringify({
        ...entry,
        timestamp: new Date().toISOString(),
        id: `${entry.agentOrigin}-${entry.cycle}-${Date.now()}`,
      }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`ledger ${res.status}`);
    const data = (await res.json()) as { id?: string; entry_id?: string };
    return { ok: true, entryId: data.id ?? data.entry_id };
  } catch (err) {
    await writeJournalToKV(entry);
    return { ok: false, error: String(err) };
  }
}
