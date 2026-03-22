// ============================================================================
// THEMIS — Government/Civic Transparency Micro Sub-Agent
//
// Polls Federal Register API and data.gov metadata.
// Free, no API key required.
// CC0 Public Domain
// ============================================================================

import {
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
  pollIntervalMs: 15 * 60 * 1000, // 15 minutes (gov data updates slowly)
  sources: ['Federal Register', 'data.gov'],
};

// ── Federal Register: recent document count ───────────────────────────────
type FRResponse = {
  count?: number;
  results?: Array<{
    title: string;
    type: string;
    publication_date: string;
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

// ── data.gov: dataset freshness check ─────────────────────────────────────
type DataGovResponse = {
  total?: number;
  dataset?: Array<{
    title: string;
    modified: string;
    publisher?: { name: string };
  }>;
};

async function pollDataGov(): Promise<MicroSignal | null> {
  // Recently modified datasets
  const url =
    'https://catalog.data.gov/api/3/action/package_search?sort=metadata_modified+desc&rows=10';

  const data = await safeFetch<{ result?: DataGovResponse }>(url);
  const result = data?.result;
  if (!result?.dataset || result.dataset.length === 0) return null;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // How recently were datasets updated?
  const modifiedTimes = result.dataset
    .map((d) => new Date(d.modified).getTime())
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

  return {
    agentName: 'THEMIS',
    source: 'data.gov',
    timestamp: new Date().toISOString(),
    value,
    label: `data.gov: top 10 datasets avg ${Math.round(avgAgeDays)}d old, ${result.total ?? '?'} total`,
    severity: classifySeverity(value, { watch: 0.5, elevated: 0.3, critical: 0.1 }),
    raw: { avgAgeDays: Math.round(avgAgeDays), total: result.total, sampleSize: result.dataset.length },
  };
}

// ── Poll all THEMIS sources ───────────────────────────────────────────────
export async function pollThemis(): Promise<AgentPollResult> {
  const errors: string[] = [];
  const signals: MicroSignal[] = [];

  const fr = await pollFederalRegister();
  if (fr) signals.push(fr);
  else errors.push('Federal Register API fetch failed');

  const dg = await pollDataGov();
  if (dg) signals.push(dg);
  else errors.push('data.gov API fetch failed');

  return {
    agentName: 'THEMIS',
    signals,
    polledAt: new Date().toISOString(),
    errors,
    healthy: signals.length > 0,
  };
}
