// ============================================================================
// THEMIS — Government/Civic Transparency Micro Sub-Agent
//
// Polls Federal Register API and layered transparency sources.
// C-261 · THEMIS fallback hardening
// CC0 Public Domain
// ============================================================================

import {
  type AgentMode,
  type AgentPollResult,
  type MicroSignal,
  type MicroAgentConfig,
  classifySeverity,
  normalizeDirect,
  safeFetch,
} from './core';

export const THEMIS_CONFIG: MicroAgentConfig = {
  name: 'THEMIS',
  description: 'Governance transparency — federal register activity, open data health',
  pollIntervalMs: 15 * 60 * 1000,
  sources: ['Federal Register', 'data.gov'],
};

// ── Federal Register: recent document count ───────────────────────────────
type FRResponse = {
  count?: number;
  results?: Array<{
    title: string;
    type: string;
    publication_date?: string;
    agencies: Array<{ name: string }>;
  }>;
};

async function pollFederalRegister(): Promise<MicroSignal | null> {
  // Documents published today
  const today = new Date().toISOString().split('T')[0];
  const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[publication_date][is]=${today}&per_page=20&order=newest`;

  const data = await safeFetch<FRResponse>(url);
  if (!data) return null;

  const count = data.count ?? 0;
  const results = data.results ?? [];

  // Typical day: 20-100 docs. 0 = holiday or outage. 200+ = regulatory surge
  const value = count === 0
    ? 0.5 // ambiguous — could be weekend
    : count <= 100
      ? Number(normalizeDirect(count, 0, 100).toFixed(3))
      : Number(Math.max(0.7, 1 - (count - 100) / 500).toFixed(3));

  const types = results.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.type] = (acc[doc.type] ?? 0) + 1;
    return acc;
  }, {});

  const typeStr = Object.entries(types)
    .map(([t, c]) => `${c} ${t.toLowerCase()}`)
    .join(', ');

  return {
    agentName: 'THEMIS',
    source: 'Federal Register',
    timestamp: new Date().toISOString(),
    value,
    label: `Federal Register: ${count} docs today${typeStr ? ` (${typeStr})` : ''}`,
    severity: classifySeverity(value, { watch: 0.4, elevated: 0.2, critical: 0.05 }),
    raw: { count, types, date: today },
  };
}

// ── Transparency sources: data.gov + fallback paths ────────────────────────
type DataGovDataset = {
  title?: string;
  modified?: string;
  metadata_modified?: string;
  publisher?: { name?: string };
};

type DataGovResult = {
  count?: number;
  total?: number;
  results?: DataGovDataset[];
  dataset?: DataGovDataset[];
};

type DataGovEnvelope = {
  result?: DataGovResult;
};

const DATAGOV_CATALOG_URL =
  'https://catalog.data.gov/api/3/action/package_search?sort=metadata_modified+desc&rows=10';

const THEMIS_DATA_GOV_API_KEY =
  process.env.THEMIS_DATA_GOV_API_KEY ?? process.env.API_DATA_GOV_KEY ?? '';

function getOfficialDataGovUrl(apiKey: string): string {
  return `https://api.gsa.gov/technology/datagov/v3/action/package_search?api_key=${encodeURIComponent(apiKey)}&sort=metadata_modified+desc&rows=10`;
}

let lastGoodTransparencySignal: MicroSignal | null = null;
let lastGoodTransparencyAt: string | null = null;

function extractDatasets(result?: DataGovResult): DataGovDataset[] {
  if (!result) return [];
  if (Array.isArray(result.results) && result.results.length > 0) return result.results;
  if (Array.isArray(result.dataset) && result.dataset.length > 0) return result.dataset;
  return [];
}

function buildTransparencySignal(
  source: string,
  datasets: DataGovDataset[],
  total?: number,
): MicroSignal | null {
  if (!datasets.length) return null;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const modifiedTimes = datasets
    .map((d) => new Date(d.modified ?? d.metadata_modified ?? '').getTime())
    .filter((t) => !isNaN(t));

  if (modifiedTimes.length === 0) return null;

  const avgAge = modifiedTimes.reduce((sum, t) => sum + (now - t), 0) / modifiedTimes.length;
  const avgAgeDays = avgAge / dayMs;

  // Active updates (<7d avg) = healthy, stale (>90d) = concerning
  const value = avgAgeDays <= 7
    ? 1.0
    : avgAgeDays <= 30
      ? Number((0.6 + normalizeDirect(30 - avgAgeDays, 0, 23) * 0.4).toFixed(3))
      : Number(Math.max(0.1, normalizeDirect(90 - avgAgeDays, 0, 60)).toFixed(3));

  const signal: MicroSignal = {
    agentName: 'THEMIS',
    source,
    timestamp: new Date().toISOString(),
    value,
    label: `${source}: top ${datasets.length} datasets avg ${Math.round(avgAgeDays)}d old${typeof total === 'number' ? `, ${total} total` : ''}`,
    severity: classifySeverity(value, { watch: 0.5, elevated: 0.3, critical: 0.1 }),
    raw: {
      avgAgeDays: Math.round(avgAgeDays),
      total,
      sampleSize: datasets.length,
    },
  };

  lastGoodTransparencySignal = signal;
  lastGoodTransparencyAt = signal.timestamp;

  return signal;
}

function buildCachedTransparencySignal(): MicroSignal | null {
  if (!lastGoodTransparencySignal) return null;

  const previousRaw =
    lastGoodTransparencySignal.raw &&
    typeof lastGoodTransparencySignal.raw === 'object' &&
    !Array.isArray(lastGoodTransparencySignal.raw)
      ? (lastGoodTransparencySignal.raw as Record<string, unknown>)
      : {};

  return {
    ...lastGoodTransparencySignal,
    timestamp: new Date().toISOString(),
    source: `${lastGoodTransparencySignal.source} (cached)`,
    label: `${lastGoodTransparencySignal.label} [cached snapshot]`,
    raw: {
      ...previousRaw,
      cached: true,
      cachedFrom: lastGoodTransparencyAt,
    },
  };
}

async function pollDataGovCatalog(): Promise<MicroSignal | null> {
  const data = await safeFetch<DataGovEnvelope>(DATAGOV_CATALOG_URL);
  const result = data?.result;
  if (!result) return null;
  return buildTransparencySignal('data.gov catalog', extractDatasets(result), result.total ?? result.count);
}

async function pollDataGovOfficial(): Promise<MicroSignal | null> {
  if (!THEMIS_DATA_GOV_API_KEY) return null;

  const url = getOfficialDataGovUrl(THEMIS_DATA_GOV_API_KEY);
  const data = await safeFetch<DataGovEnvelope>(url);
  const result = data?.result;
  if (!result) return null;

  return buildTransparencySignal('data.gov official', extractDatasets(result), result.total ?? result.count);
}

// Optional C-261 extension point:
// add a third-party transparency heartbeat later (e.g. fiscal/disclosure API)
// without changing the THEMIS contract again.

type SourceStatus = 'ok' | 'degraded' | 'failed' | 'cached';

function deriveMode(
  regulatoryOk: boolean,
  transparencyOk: boolean,
  fallbackUsed: string | null,
): AgentMode {
  if (regulatoryOk && transparencyOk && !fallbackUsed) return 'nominal';
  if (regulatoryOk || transparencyOk) return 'degraded';
  return 'critical';
}

// ── Poll all THEMIS sources ───────────────────────────────────────────────
export async function pollThemis(): Promise<AgentPollResult> {
  const errors: string[] = [];
  const signals: MicroSignal[] = [];
  const sourceStatus: Record<string, SourceStatus> = {
    'Federal Register': 'failed',
    'data.gov catalog': 'failed',
    'data.gov official': 'failed',
    'last-good-cache': 'failed',
  };

  const fr = await pollFederalRegister();
  if (fr) {
    signals.push(fr);
    sourceStatus['Federal Register'] = 'ok';
  } else {
    errors.push('Federal Register API fetch failed');
  }

  let transparencySignal: MicroSignal | null = null;
  let fallbackUsed: string | null = null;

  const dgCatalog = await pollDataGovCatalog();
  if (dgCatalog) {
    transparencySignal = dgCatalog;
    sourceStatus['data.gov catalog'] = 'ok';
  } else {
    errors.push('data.gov catalog API fetch failed');

    const dgOfficial = await pollDataGovOfficial();
    if (dgOfficial) {
      transparencySignal = dgOfficial;
      sourceStatus['data.gov official'] = 'degraded';
      fallbackUsed = 'data.gov official';
    } else {
      if (THEMIS_DATA_GOV_API_KEY) {
        errors.push('data.gov official API fetch failed');
      }

      const cached = buildCachedTransparencySignal();
      if (cached) {
        transparencySignal = cached;
        sourceStatus['last-good-cache'] = 'cached';
        fallbackUsed = 'last-good-cache';
      } else {
        errors.push('No THEMIS transparency fallback available');
      }
    }
  }

  if (transparencySignal) {
    signals.push(transparencySignal);
  }

  const regulatoryOk = !!fr;
  const transparencyOk = !!transparencySignal;
  const mode = deriveMode(regulatoryOk, transparencyOk, fallbackUsed);

  return {
    agentName: 'THEMIS',
    signals,
    polledAt: new Date().toISOString(),
    errors,
    healthy: regulatoryOk && transparencyOk,
    mode,
    sourceStatus,
    fallbackUsed,
    lastGoodAt: lastGoodTransparencyAt,
  };
}
