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

