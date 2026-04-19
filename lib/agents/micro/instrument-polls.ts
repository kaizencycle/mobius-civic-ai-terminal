/**
 * Mobius Sensor Federation — 40 micro-instruments (8 parent families × 5).
 * Each poll hits a documented public HTTP API (no keys unless env already used elsewhere).
 * See: docs/architecture/microagent-public-endpoints.md
 */

import type { AgentPollResult, MicroSignal } from './core';
import {
  classifySeverity,
  normalizeDirect,
  normalizeInverse,
  safeFetch,
  safeFetchText,
  safeFetchWithMeta,
} from './core';
import { fetchEonetEvents, scoreEonetEvents } from '@/lib/signals/eonet';

const UA_HEADERS: HeadersInit = {
  'User-Agent': 'MobiusTerminal/1.0 (+https://github.com/kaizencycle/mobius-civic-ai-terminal)',
};

function wrap(agentName: string, signal: MicroSignal | null, err?: string): AgentPollResult {
  return {
    agentName,
    signals: signal ? [signal] : [],
    polledAt: new Date().toISOString(),
    errors: signal ? [] : [err ?? `${agentName}: no signal`],
    healthy: Boolean(signal),
  };
}

function stalenessPenalty(dataYear: string | number | undefined): number {
  if (!dataYear) return 0;
  const year = typeof dataYear === 'number' ? dataYear : Number.parseInt(String(dataYear), 10);
  if (!Number.isFinite(year)) return 0;
  const age = new Date().getFullYear() - year;
  if (age <= 1) return 0;
  return Math.min(0.3, age * 0.1);
}

// ── ATLAS (strategic / planetary) ───────────────────────────────────────────

export async function pollAtlasU1(): Promise<AgentPollResult> {
  type Row = { date: string; value: string | number | null };
  const url =
    'https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=8&mrnev=1';
  const data = await safeFetch<[unknown, Row[]]>(url);
  const rows = Array.isArray(data?.[1]) ? data![1]! : [];
  const vals = rows
    .map((r) => (typeof r.value === 'number' ? r.value : Number.parseFloat(String(r.value ?? ''))))
    .filter((n) => Number.isFinite(n));
  if (vals.length === 0) return wrap('ATLAS-µ1', null);
  const latest = vals[0]!;
  const dataYear = rows[0]?.date;
  const penalty = stalenessPenalty(dataYear);
  const raw = Number(normalizeDirect(Math.max(-5, Math.min(10, latest)), -3, 8).toFixed(3));
  const value = Number(Math.max(0, raw - penalty).toFixed(3));
  const staleNote = penalty > 0 ? ` [stale: ${dataYear}, -${penalty.toFixed(1)}]` : '';
  return wrap('ATLAS-µ1', {
    agentName: 'ATLAS-µ1',
    source: 'World Bank · WLD real GDP growth',
    timestamp: new Date().toISOString(),
    value,
    label: `WB WLD GDP growth latest: ${latest.toFixed(2)}% (y/y)${staleNote}`,
    severity: classifySeverity(value, { watch: 0.45, elevated: 0.28, critical: 0.12 }),
    raw: { samples: rows.slice(0, 3), dataYear, stalenessPenalty: penalty },
  });
}

export async function pollAtlasU2(): Promise<AgentPollResult> {
  const url = 'https://api.reliefweb.int/v1/disasters?appname=mobius-terminal&limit=8';
  const data = await safeFetch<{ data?: Array<{ id?: number; fields?: { name?: string } }> }>(url, 12000);
  const n = data?.data?.length ?? 0;
  const value = Number(normalizeInverse(n, 0, 40).toFixed(3));
  const top = data?.data?.[0]?.fields?.name ?? 'n/a';
  return wrap('ATLAS-µ2', {
    agentName: 'ATLAS-µ2',
    source: 'ReliefWeb · disasters',
    timestamp: new Date().toISOString(),
    value,
    label: `ReliefWeb: ${n} open disasters · ${top}`,
    severity: classifySeverity(value, { watch: 0.45, elevated: 0.28, critical: 0.12 }),
    raw: { count: n },
  });
}

export async function pollAtlasU3(): Promise<AgentPollResult> {
  const url = 'https://restcountries.com/v3.1/alpha/us';
  const data = await safeFetch<Array<{ population?: number; name?: { common?: string } }>>(url);
  const pop = data?.[0]?.population;
  if (typeof pop !== 'number') return wrap('ATLAS-µ3', null);
  const value = Number(normalizeDirect(Math.log10(pop + 1), 8, 9.6).toFixed(3));
  return wrap('ATLAS-µ3', {
    agentName: 'ATLAS-µ3',
    source: 'REST Countries · US',
    timestamp: new Date().toISOString(),
    value,
    label: `Population context: ${data![0]!.name?.common ?? 'US'} ≈ ${(pop / 1e6).toFixed(1)}M`,
    severity: 'nominal',
    raw: { population: pop },
  });
}

export async function pollAtlasU4(): Promise<AgentPollResult> {
  const url = 'https://api.weather.gov/alerts/active?area=US';
  const data = await safeFetch<{ features?: unknown[] }>(url, 12000, { headers: UA_HEADERS });
  const n = data?.features?.length ?? 0;
  const value = Number(normalizeInverse(n, 0, 200).toFixed(3));
  return wrap('ATLAS-µ4', {
    agentName: 'ATLAS-µ4',
    source: 'NWS · active alerts US',
    timestamp: new Date().toISOString(),
    value,
    label: `NWS: ${n} active alerts (US area)`,
    severity: classifySeverity(value, { watch: 0.42, elevated: 0.25, critical: 0.1 }),
    raw: { count: n },
  });
}

async function openMeteoNyc(): Promise<MicroSignal | null> {
  type OpenMeteoResponse = { current?: { temperature_2m?: number; wind_speed_10m?: number; weather_code?: number } };
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=40.66&longitude=-73.55&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph';
  const data = await safeFetch<OpenMeteoResponse>(url);
  if (!data?.current) return null;
  const temp = data.current.temperature_2m ?? 65;
  const wind = data.current.wind_speed_10m ?? 5;
  const code = data.current.weather_code ?? 0;
  const tempScore =
    temp >= 55 && temp <= 80 ? 1.0 : temp < 55 ? normalizeDirect(temp, 0, 55) : normalizeInverse(temp, 80, 115);
  const windScore = normalizeInverse(wind, 0, 75);
  const codeScore = code < 50 ? 1.0 : code < 80 ? 0.7 : code < 95 ? 0.4 : 0.2;
  const value = Number((0.4 * tempScore + 0.3 * windScore + 0.3 * codeScore).toFixed(3));
  return {
    agentName: 'ATLAS-µ5',
    source: 'Open-Meteo · NYC corridor',
    timestamp: new Date().toISOString(),
    value,
    label: `Meteo NYC: ${Math.round(temp)}°F, wind ${Math.round(wind)}mph, wx ${code}`,
    severity: classifySeverity(value),
    raw: data.current,
  };
}

export async function pollAtlasU5(): Promise<AgentPollResult> {
  const s = await openMeteoNyc();
  return wrap('ATLAS-µ5', s ? { ...s, agentName: 'ATLAS-µ5' } : null);
}

// ── ZEUS (verification / corroboration surfaces) ───────────────────────────

export async function pollZeusU1(): Promise<AgentPollResult> {
  const url = 'https://api.crossref.org/works?query=integrity+governance&rows=5';
  const data = await safeFetch<{ message?: { items?: unknown[] } }>(url);
  const n = data?.message?.items?.length ?? 0;
  const value = Number(normalizeDirect(Math.min(n, 5), 0, 5).toFixed(3));
  return wrap('ZEUS-µ1', {
    agentName: 'ZEUS-µ1',
    source: 'CrossRef · scholarly works',
    timestamp: new Date().toISOString(),
    value,
    label: `CrossRef: ${n} work hits for integrity+governance`,
    severity: 'nominal',
    raw: { count: n },
  });
}

export async function pollZeusU2(): Promise<AgentPollResult> {
  const url =
    'https://export.arxiv.org/api/query?search_query=all:verification&start=0&max_results=5';
  const text = await safeFetchText(url, 12000);
  const entries = (text?.match(/<entry>/g) ?? []).length;
  const value = Number(normalizeDirect(entries, 0, 5).toFixed(3));
  return wrap('ZEUS-µ2', {
    agentName: 'ZEUS-µ2',
    source: 'arXiv · API',
    timestamp: new Date().toISOString(),
    value,
    label: `arXiv: ${entries} results (verification query)`,
    severity: 'nominal',
    raw: { entries },
  });
}

export async function pollZeusU3(): Promise<AgentPollResult> {
  const url = 'https://api.coincap.io/v2/assets?limit=8';
  const meta = await safeFetchWithMeta<{ data?: Array<{ id?: string; changePercent24Hr?: string }> }>(url);
  if (!meta.ok || meta.data === null) {
    return wrap(
      'ZEUS-µ3',
      null,
      `ZEUS-µ3: no signal — source: ${url} status: ${meta.status ?? 'n/a'} reason: ${meta.error ?? 'unknown'}`,
    );
  }
  const rows = meta.data.data ?? [];
  if (rows.length === 0) {
    return wrap(
      'ZEUS-µ3',
      null,
      `ZEUS-µ3: no signal — source: ${url} status: ${meta.status ?? 200} reason: empty assets list`,
    );
  }
  const changes = rows
    .map((r) => Number.parseFloat(r.changePercent24Hr ?? '0'))
    .filter((n) => Number.isFinite(n));
  const avg = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
  const value = Number(normalizeInverse(Math.abs(avg), 0, 15).toFixed(3));
  return wrap('ZEUS-µ3', {
    agentName: 'ZEUS-µ3',
    source: 'CoinCap · crypto volatility',
    timestamp: new Date().toISOString(),
    value,
    label: `CoinCap: avg 24h Δ across top ${rows.length} ≈ ${avg.toFixed(2)}%`,
    severity: classifySeverity(value, { watch: 0.45, elevated: 0.28, critical: 0.12 }),
    raw: { top: rows[0]?.id },
  });
}

export async function pollZeusU4(): Promise<AgentPollResult> {
  // EUR and GBP only — JPY has ~100× different magnitude and would dominate the spread
  // incorrectly, making the value always 0 (critical) even in normal market conditions.
  const url = 'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP';
  const data = await safeFetch<{ rates?: Record<string, number> }>(url);
  const rates = data?.rates;
  if (!rates) return wrap('ZEUS-µ4', null);
  const vals = Object.values(rates).filter((r) => Number.isFinite(r));
  if (vals.length < 2) return wrap('ZEUS-µ4', null);
  const spread = Math.max(...vals) - Math.min(...vals);
  // Typical EUR/GBP spread is ~0.05–0.25; anything above 0.5 is elevated FX divergence.
  const value = Number(normalizeInverse(spread, 0, 0.5).toFixed(3));
  return wrap('ZEUS-µ4', {
    agentName: 'ZEUS-µ4',
    source: 'Frankfurter · FX cross-check EUR/GBP',
    timestamp: new Date().toISOString(),
    value,
    label: `FX: USD→EUR ${rates.EUR?.toFixed(4) ?? '?'} / GBP ${rates.GBP?.toFixed(4) ?? '?'} spread ${spread.toFixed(4)}`,
    severity: classifySeverity(value, { watch: 0.45, elevated: 0.28, critical: 0.12 }),
    raw: rates,
  });
}

export async function pollZeusU5(): Promise<AgentPollResult> {
  const url = 'https://openlibrary.org/search.json?q=governance&limit=5';
  const data = await safeFetch<{ numFound?: number }>(url);
  const n = data?.numFound;
  if (typeof n !== 'number') return wrap('ZEUS-µ5', null);
  const value = Number(normalizeDirect(Math.min(n, 5000), 0, 5000).toFixed(3));
  return wrap('ZEUS-µ5', {
    agentName: 'ZEUS-µ5',
    source: 'Open Library · corpus',
    timestamp: new Date().toISOString(),
    value,
    label: `OpenLibrary: governance query → ${n} hits`,
    severity: 'nominal',
    raw: { numFound: n },
  });
}

// ── HERMES (information velocity) ──────────────────────────────────────────

export async function pollHermesU1(): Promise<AgentPollResult> {
  const top = await safeFetch<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!top?.length) return wrap('HERMES-µ1', null);
  const id = top[0]!;
  const item = await safeFetch<{ score?: number; title?: string }>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
  const score = item?.score ?? 0;
  // Normalize across full observed range (0–600). A low score on the current #1 post
  // just means the story is fresh — it is not a civic signal of systemic failure.
  const value = Number(normalizeDirect(score, 0, 600).toFixed(3));
  return wrap('HERMES-µ1', {
    agentName: 'HERMES-µ1',
    source: 'Hacker News · top story',
    timestamp: new Date().toISOString(),
    value,
    label: `HN #1 score ${score}: ${(item?.title ?? '').slice(0, 80)}`,
    severity: score === 0 ? 'watch' : classifySeverity(value, { watch: 0.15, elevated: 0.05, critical: 0.01 }),
    raw: { id, score },
  });
}

export async function pollHermesU2(): Promise<AgentPollResult> {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rclimit=30&rctype=edit&rcprop=timestamp&format=json&origin=*';
  const data = await safeFetch<{ query?: { recentchanges?: { timestamp: string }[] } }>(url);
  const rc = data?.query?.recentchanges;
  if (!rc?.length) return wrap('HERMES-µ2', null);
  const span = (Date.now() - new Date(rc[rc.length - 1]!.timestamp).getTime()) / 60000;
  const epm = span > 0 ? rc.length / span : 0;
  const value =
    epm < 1
      ? Number((normalizeDirect(epm, 0, 1) * 0.5).toFixed(3))
      : Number((0.5 + normalizeDirect(Math.min(epm, 12), 1, 12) * 0.5).toFixed(3));
  return wrap('HERMES-µ2', {
    agentName: 'HERMES-µ2',
    source: 'Wikipedia · recent changes',
    timestamp: new Date().toISOString(),
    value,
    label: `Wiki: ~${epm.toFixed(1)} edits/min (sample ${rc.length})`,
    severity: classifySeverity(value, { watch: 0.4, elevated: 0.2, critical: 0.05 }),
    raw: { epm },
  });
}

export async function pollHermesU3(): Promise<AgentPollResult> {
  const queries = ['governance OR democracy OR civic', 'transparency OR regulation OR policy'];
  let n = 0;
  let lastMeta: Awaited<ReturnType<typeof safeFetchWithMeta<{ articles?: unknown[] }>>> | null = null;
  for (const q of queries) {
    const url =
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=8&format=json&timespan=1d`;
    const meta = await safeFetchWithMeta<{ articles?: unknown[] }>(url, 12000);
    lastMeta = meta;
    if (meta.ok && meta.data) {
      n += meta.data.articles?.length ?? 0;
    }
    if (n > 0) break;
  }
  const d = new Date();
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const quietHour = d.getUTCHours() >= 0 && d.getUTCHours() <= 8;
  const httpOk = Boolean(lastMeta?.ok);
  const quietContext = httpOk && n === 0 && (weekend || quietHour);
  const value = Number((quietContext ? 0.5 : normalizeDirect(Math.min(n, 16), 0, 16)).toFixed(3));
  const severity = quietContext
    ? 'nominal'
    : n === 0
      ? 'watch'
      : classifySeverity(value, { watch: 0.45, elevated: 0.3, critical: 0.15 });
  return wrap('HERMES-µ3', {
    agentName: 'HERMES-µ3',
    source: 'GDELT · governance artlist',
    timestamp: new Date().toISOString(),
    value,
    label: quietContext
      ? `GDELT: 0 articles (quiet window — HTTP ${lastMeta?.status ?? 'ok'}, nominal)`
      : `GDELT: ${n} articles (24h governance+civic)`,
    severity,
    raw: { count: n, httpOk, quietContext },
  });
}

export async function pollHermesU4(): Promise<AgentPollResult> {
  const subs = ['worldnews', 'technology', 'civictech'];
  let kids: Array<{ data?: { score?: number; title?: string } }> = [];
  let lastStatus: number | null = null;
  let lastOk = false;
  for (const sub of subs) {
    const url = `https://www.reddit.com/r/${sub}/hot.json?limit=8`;
    const meta = await safeFetchWithMeta<{ data?: { children?: Array<{ data?: { score?: number; title?: string } }> } }>(
      url,
      12000,
      { headers: { ...UA_HEADERS, Accept: 'application/json' } },
    );
    lastStatus = meta.status;
    lastOk = meta.ok;
    if (meta.ok && meta.data) {
      kids = meta.data.data?.children ?? [];
    }
    if (kids.length > 0) break;
  }
  const scores = kids.map((c) => c.data?.score ?? 0);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const d = new Date();
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const quietHour = d.getUTCHours() >= 0 && d.getUTCHours() <= 8;
  const quietContext = lastOk && kids.length === 0 && (weekend || quietHour);
  const value = Number((quietContext ? 0.5 : normalizeDirect(avg, 0, 2000)).toFixed(3));
  const severity =
    quietContext ? 'nominal' : kids.length === 0 ? 'watch' : classifySeverity(value, { watch: 0.4, elevated: 0.22, critical: 0.08 });
  return wrap('HERMES-µ4', {
    agentName: 'HERMES-µ4',
    source: 'Reddit · narrative feed',
    timestamp: new Date().toISOString(),
    value,
    label: quietContext
      ? `Reddit: 0 posts in sample (quiet window — HTTP ${lastStatus ?? 'ok'}, nominal)`
      : `Reddit narrative: avg score ${Math.round(avg)} on ${kids.length} posts`,
    severity,
    raw: { count: kids.length, httpOk: lastOk, quietContext },
  });
}

export async function pollHermesU5(): Promise<AgentPollResult> {
  const url = 'https://api.spacexdata.com/v4/launches/upcoming';
  const data = await safeFetch<unknown[]>(url);
  const n = Array.isArray(data) ? data.length : 0;
  const value = Number(normalizeDirect(n, 0, 10).toFixed(3));
  return wrap('HERMES-µ5', {
    agentName: 'HERMES-µ5',
    source: 'SpaceX · launches API',
    timestamp: new Date().toISOString(),
    value,
    label: `SpaceX: ${n} upcoming launches in public feed`,
    severity: 'nominal',
    raw: { count: n },
  });
}

// ── AUREA (governance / institutions) ─────────────────────────────────────

export async function pollAureaU1(): Promise<AgentPollResult> {
  const today = new Date().toISOString().split('T')[0];
  const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[publication_date][is]=${today}&per_page=10&order=newest`;
  const data = await safeFetch<{ count?: number }>(url);
  const count = data?.count ?? 0;
  const dow = new Date().getUTCDay();
  const weekend = dow === 0 || dow === 6;
  const nominalZero = count === 0 && weekend;
  const value = Number(
    (
      nominalZero
        ? 1
        : count === 0
          ? 0.5
          : count <= 100
            ? normalizeDirect(count, 0, 100)
            : Math.max(0.7, 1 - (count - 100) / 500)
    ).toFixed(3),
  );
  return wrap('AUREA-µ1', {
    agentName: 'AUREA-µ1',
    source: 'Federal Register · volume',
    timestamp: new Date().toISOString(),
    value,
    label: nominalZero
      ? `FR today: ${count} documents (weekend — nominal)`
      : `FR today: ${count} documents`,
    severity: nominalZero ? 'nominal' : classifySeverity(value, { watch: 0.4, elevated: 0.2, critical: 0.05 }),
    raw: { date: today, count, weekendNominalZero: nominalZero },
  });
}

export async function pollAureaU2(): Promise<AgentPollResult> {
  const url = 'https://catalog.data.gov/api/3/action/package_search?rows=5&sort=metadata_modified+desc';
  const meta = await safeFetchWithMeta<{ result?: { count?: number } }>(url);
  if (!meta.ok || meta.data === null) {
    return wrap(
      'AUREA-µ2',
      null,
      `AUREA-µ2: no signal — source: ${url} status: ${meta.status ?? 'n/a'} reason: ${meta.error ?? 'unknown'}`,
    );
  }
  const n = meta.data.result?.count;
  if (typeof n !== 'number') {
    return wrap(
      'AUREA-µ2',
      null,
      `AUREA-µ2: no signal — source: ${url} status: ${meta.status ?? 200} reason: missing result.count`,
    );
  }
  const value = Number(normalizeDirect(Math.min(n, 500_000), 0, 500_000).toFixed(3));
  return wrap('AUREA-µ2', {
    agentName: 'AUREA-µ2',
    source: 'data.gov · catalog size',
    timestamp: new Date().toISOString(),
    value,
    label: `data.gov catalog: ${n.toLocaleString()} datasets indexed`,
    severity: 'nominal',
    raw: { count: n },
  });
}

export async function pollAureaU3(): Promise<AgentPollResult> {
  const url = 'https://api.fda.gov/drug/event.json?limit=5';
  const data = await safeFetch<{ results?: unknown[]; meta?: { results?: { limit?: number } } }>(url);
  const n = data?.results?.length ?? 0;
  const value = n > 0 ? 0.75 : 0.45;
  return wrap('AUREA-µ3', {
    agentName: 'AUREA-µ3',
    source: 'openFDA · drug events sample',
    timestamp: new Date().toISOString(),
    value,
    label: `openFDA: ${n} adverse event rows (sample query)`,
    severity: n > 0 ? 'nominal' : 'watch',
    raw: { count: n },
  });
}

export async function pollAureaU4(): Promise<AgentPollResult> {
  const url =
    'https://api.census.gov/data/2021/pep/natmonthly?get=POP,NAME&for=us:*';
  const data = await safeFetch<string[][]>(url);
  const row = data?.[1];
  const pop = row && row[0] ? Number.parseInt(row[0], 10) : NaN;
  if (!Number.isFinite(pop)) return wrap('AUREA-µ4', null);
  const value = Number(normalizeDirect(Math.log10(pop), 8.5, 9.1).toFixed(3));
  return wrap('AUREA-µ4', {
    agentName: 'AUREA-µ4',
    source: 'US Census · national monthly PEP',
    timestamp: new Date().toISOString(),
    value,
    label: `US POP estimate: ${(pop / 1e6).toFixed(2)}M`,
    severity: 'nominal',
    raw: { pop },
  });
}

export async function pollAureaU5(): Promise<AgentPollResult> {
  const url = 'https://api.usaspending.gov/api/v2/references/toptier_agencies/?limit=10';
  const data = await safeFetch<{ results?: unknown[] }>(url);
  const n = data?.results?.length ?? 0;
  const value = Number(normalizeDirect(n, 0, 10).toFixed(3));
  return wrap('AUREA-µ5', {
    agentName: 'AUREA-µ5',
    source: 'USAspending · agency reference',
    timestamp: new Date().toISOString(),
    value,
    label: `USAspending: ${n} toptier agencies in reference slice`,
    severity: 'nominal',
    raw: { count: n },
  });
}

// ── JADE (memory / culture / precedent signals) ───────────────────────────

export async function pollJadeU1(): Promise<AgentPollResult> {
  const url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q42&format=json&origin=*';
  const data = await safeFetch<{ entities?: Record<string, { labels?: { en?: { value?: string } } }> }>(url);
  const label = data?.entities?.Q42?.labels?.en?.value;
  if (!label) return wrap('JADE-µ1', null);
  return wrap('JADE-µ1', {
    agentName: 'JADE-µ1',
    source: 'Wikidata · entity probe',
    timestamp: new Date().toISOString(),
    value: 0.88,
    label: `Wikidata Q42 label: ${label}`,
    severity: 'nominal',
    raw: { id: 'Q42', label },
  });
}

export async function pollJadeU2(): Promise<AgentPollResult> {
  const url = 'https://api.quotable.io/random';
  const data = await safeFetch<{ content?: string; author?: string }>(url);
  if (!data?.content) return wrap('JADE-µ2', null);
  return wrap('JADE-µ2', {
    agentName: 'JADE-µ2',
    source: 'Quotable · random quote',
    timestamp: new Date().toISOString(),
    value: 0.72,
    label: `Quote: “${data.content.slice(0, 70)}…” — ${data.author ?? 'unknown'}`,
    severity: 'nominal',
    raw: { author: data.author },
  });
}

export async function pollJadeU3(): Promise<AgentPollResult> {
  const url = 'https://collectionapi.metmuseum.org/public/collection/v1/objects/45734';
  const data = await safeFetch<{ title?: string; objectDate?: string }>(url);
  if (!data?.title) return wrap('JADE-µ3', null);
  return wrap('JADE-µ3', {
    agentName: 'JADE-µ3',
    source: 'Met Museum · public collection',
    timestamp: new Date().toISOString(),
    value: 0.85,
    label: `Met: ${data.title} (${data.objectDate ?? 'date n/a'})`,
    severity: 'nominal',
    raw: data,
  });
}

export async function pollJadeU4(): Promise<AgentPollResult> {
  const url = 'https://openlibrary.org/authors/OL23466A.json';
  const data = await safeFetch<{ name?: string; work_count?: number }>(url);
  if (!data?.name) return wrap('JADE-µ4', null);
  const wc = data.work_count ?? 0;
  const value = Number(normalizeDirect(Math.min(wc, 200), 0, 200).toFixed(3));
  return wrap('JADE-µ4', {
    agentName: 'JADE-µ4',
    source: 'Open Library · author record',
    timestamp: new Date().toISOString(),
    value,
    label: `OL author ${data.name}: ${wc} works`,
    severity: 'nominal',
    raw: { work_count: wc },
  });
}

export async function pollJadeU5(): Promise<AgentPollResult> {
  const url = 'https://poetrydb.org/random/1';
  const data = await safeFetch<Array<{ title?: string; author?: string }>>(url);
  const row = data?.[0];
  if (!row?.title) return wrap('JADE-µ5', null);
  return wrap('JADE-µ5', {
    agentName: 'JADE-µ5',
    source: 'Poetry DB · random',
    timestamp: new Date().toISOString(),
    value: 0.78,
    label: `Poetry: ${row.title} — ${row.author ?? 'unknown'}`,
    severity: 'nominal',
    raw: row,
  });
}

// ── DAEDALUS (systems / build health) ─────────────────────────────────────

export async function pollDaedalusU1(): Promise<AgentPollResult> {
  const url = 'https://api.github.com/repos/vercel/next.js';
  const data = await safeFetch<{ stargazers_count?: number; open_issues_count?: number }>(url, 10000, {
    headers: UA_HEADERS,
  });
  if (!data) return wrap('DAEDALUS-µ1', null);
  const stars = data.stargazers_count ?? 0;
  const issues = data.open_issues_count ?? 0;
  const value = Number((0.6 * normalizeDirect(Math.log10(stars + 1), 4, 6) + 0.4 * normalizeInverse(issues, 500, 5000)).toFixed(3));
  return wrap('DAEDALUS-µ1', {
    agentName: 'DAEDALUS-µ1',
    source: 'GitHub · next.js repo',
    timestamp: new Date().toISOString(),
    value,
    label: `next.js: ★${stars.toLocaleString()} · ${issues} open issues`,
    severity: classifySeverity(value, { watch: 0.45, elevated: 0.28, critical: 0.12 }),
    raw: { stars, issues },
  });
}

export async function pollDaedalusU2(): Promise<AgentPollResult> {
  const url = 'https://registry.npmjs.org/react/latest';
  const data = await safeFetch<{ time?: Record<string, string> }>(url);
  const t = data?.time?.modified;
  if (!t) return wrap('DAEDALUS-µ2', null);
  const days = (Date.now() - new Date(t).getTime()) / 86400000;
  const value = Number(normalizeInverse(days, 0, 45).toFixed(3));
  return wrap('DAEDALUS-µ2', {
    agentName: 'DAEDALUS-µ2',
    source: 'npm · react@latest',
    timestamp: new Date().toISOString(),
    value,
    label: `react latest modified ${Math.round(days)}d ago`,
    severity: classifySeverity(value, { watch: 0.5, elevated: 0.3, critical: 0.1 }),
    raw: { modified: t },
  });
}

export async function pollDaedalusU3(): Promise<AgentPollResult> {
  const url = 'https://registry.npmjs.org/typescript/latest';
  const data = await safeFetch<{ 'dist-tags'?: { latest?: string } }>(url);
  const v = data?.['dist-tags']?.latest;
  if (!v) return wrap('DAEDALUS-µ3', null);
  return wrap('DAEDALUS-µ3', {
    agentName: 'DAEDALUS-µ3',
    source: 'npm · typescript latest tag',
    timestamp: new Date().toISOString(),
    value: 0.82,
    label: `TypeScript latest: ${v}`,
    severity: 'nominal',
    raw: { version: v },
  });
}

export async function pollDaedalusU4(): Promise<AgentPollResult> {
  const url = 'https://status.npmjs.org/api/v2/status.json';
  const data = await safeFetch<{ status?: { indicator?: string; description?: string } }>(url);
  const ind = data?.status?.indicator ?? 'unknown';
  const value = ind === 'none' ? 1.0 : ind === 'minor' ? 0.75 : ind === 'major' ? 0.45 : 0.25;
  return wrap('DAEDALUS-µ4', {
    agentName: 'DAEDALUS-µ4',
    source: 'npm · status API',
    timestamp: new Date().toISOString(),
    value: Number(value.toFixed(3)),
    label: `npm status: ${ind} — ${data?.status?.description ?? ''}`,
    severity: ind === 'none' ? 'nominal' : 'watch',
    raw: data?.status,
  });
}

export async function pollDaedalusU5(): Promise<AgentPollResult> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (!baseUrl) {
    return wrap('DAEDALUS-µ5', {
      agentName: 'DAEDALUS-µ5',
      source: 'Self-ping',
      timestamp: new Date().toISOString(),
      value: 0.5,
      label: 'Self-ping: no VERCEL_URL',
      severity: 'watch',
    });
  }
  const host = baseUrl.replace(/^https?:\/\//, '');
  const url = `https://${host}/api/health/ping`;
  const start = Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const ms = Date.now() - start;
    const value = Number(normalizeInverse(ms, 0, 3000).toFixed(3));
    const isDeploymentAuth = res.status === 401 || res.status === 403;
    const reachable = res.ok || isDeploymentAuth;
    return wrap('DAEDALUS-µ5', {
      agentName: 'DAEDALUS-µ5',
      source: 'Self-ping · health',
      timestamp: new Date().toISOString(),
      value,
      label: `Self-ping: ${res.status} in ${ms}ms${isDeploymentAuth ? ' (deploy auth)' : ''}`,
      severity: reachable ? classifySeverity(value) : 'elevated',
      raw: { status: res.status, ms },
    });
  } catch {
    return wrap('DAEDALUS-µ5', {
      agentName: 'DAEDALUS-µ5',
      source: 'Self-ping · health',
      timestamp: new Date().toISOString(),
      value: 0,
      label: 'Self-ping: unreachable',
      severity: 'critical',
    });
  }
}

// ── ECHO (raw events / markets / environment) ──────────────────────────────

export async function pollEchoU1(): Promise<AgentPollResult> {
  const url =
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true';
  const data = await safeFetch<
    Record<string, { usd?: number; usd_24h_change?: number }>
  >(url, 12000);
  if (!data?.bitcoin?.usd) return wrap('ECHO-µ1', null);
  const ch = Math.abs(data.bitcoin.usd_24h_change ?? 0);
  const value = Number(normalizeInverse(ch, 0, 12).toFixed(3));
  return wrap('ECHO-µ1', {
    agentName: 'ECHO-µ1',
    source: 'CoinGecko · majors',
    timestamp: new Date().toISOString(),
    value,
    label: `CoinGecko: BTC $${data.bitcoin.usd} (24h ${(data.bitcoin.usd_24h_change ?? 0).toFixed(2)}%)`,
    severity: classifySeverity(value, { watch: 0.45, elevated: 0.28, critical: 0.12 }),
    raw: data,
  });
}

export async function pollEchoU2(): Promise<AgentPollResult> {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
  const data = await safeFetch<{ features?: { properties: { mag: number; place: string } }[] }>(url);
  const feats = data?.features ?? [];
  const n = feats.length;
  const maxMag = feats.reduce((m, f) => Math.max(m, f.properties.mag), 0);
  const value = Number((0.5 * normalizeInverse(n, 0, 30) + 0.5 * normalizeInverse(maxMag, 4.5, 8)).toFixed(3));
  return wrap('ECHO-µ2', {
    agentName: 'ECHO-µ2',
    source: 'USGS · M4.5+ day feed',
    timestamp: new Date().toISOString(),
    value,
    label: `USGS M4.5+: ${n} events, max M${maxMag.toFixed(1)}`,
    severity: classifySeverity(value, { watch: 0.45, elevated: 0.28, critical: 0.1 }),
    raw: { count: n, maxMag },
  });
}

export async function pollEchoU3(): Promise<AgentPollResult> {
  const events = await fetchEonetEvents(5).catch(() => []);
  const v = scoreEonetEvents(events);
  return wrap('ECHO-µ3', {
    agentName: 'ECHO-µ3',
    source: 'NASA EONET · events',
    timestamp: new Date().toISOString(),
    value: v,
    label: `EONET: ${events.length} open events (7d window)`,
    severity: events.length > 25 ? 'elevated' : 'nominal',
    raw: { count: events.length },
  });
}

export async function pollEchoU4(): Promise<AgentPollResult> {
  const url = 'https://api.open-notify.org/astros.json';
  const data = await safeFetch<{ number?: number; people?: { name: string }[] }>(url);
  const n = data?.number ?? 0;
  const value = Number(normalizeDirect(n, 0, 12).toFixed(3));
  return wrap('ECHO-µ4', {
    agentName: 'ECHO-µ4',
    source: 'Open Notify · ISS crew',
    timestamp: new Date().toISOString(),
    value,
    label: `People in space right now: ${n}`,
    severity: 'nominal',
    raw: { sample: data?.people?.slice(0, 3).map((p) => p.name) },
  });
}

export async function pollEchoU5(): Promise<AgentPollResult> {
  const key = process.env.NASA_APOD_KEY?.trim() || 'DEMO_KEY';
  const url = `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`;
  const data = await safeFetch<{ title?: string; url?: string; media_type?: string }>(url);
  if (!data?.title) return wrap('ECHO-µ5', null);
  return wrap('ECHO-µ5', {
    agentName: 'ECHO-µ5',
    source: 'NASA APOD',
    timestamp: new Date().toISOString(),
    value: 0.9,
    label: `APOD: ${data.title}`,
    severity: 'nominal',
    raw: { media_type: data.media_type },
  });
}

// ── EVE (civic / demographic / participation proxies) ─────────────────────

export async function pollEveU1(): Promise<AgentPollResult> {
  const url = 'https://datausa.io/api/data?drilldowns=Nation&measures=Population&year=latest';
  const data = await safeFetch<{ data?: Array<{ Population?: number; Year?: string }> }>(url);
  const pop = data?.data?.[0]?.Population;
  if (typeof pop !== 'number') return wrap('EVE-µ1', null);
  const value = Number(normalizeDirect(Math.log10(pop + 1), 8.5, 9.1).toFixed(3));
  return wrap('EVE-µ1', {
    agentName: 'EVE-µ1',
    source: 'Data USA · national population',
    timestamp: new Date().toISOString(),
    value,
    label: `DataUSA nation POP: ${(pop / 1e6).toFixed(2)}M`,
    severity: 'nominal',
    raw: { year: data?.data?.[0]?.Year },
  });
}

export async function pollEveU2(): Promise<AgentPollResult> {
  const url = 'https://api.agify.io?name=alex';
  const data = await safeFetch<{ age?: number | null; count?: number }>(url);
  if (data?.age == null) return wrap('EVE-µ2', null);
  return wrap('EVE-µ2', {
    agentName: 'EVE-µ2',
    source: 'Agify · demographic probe',
    timestamp: new Date().toISOString(),
    value: 0.7,
    label: `Agify “alex” inferred age ${data.age} (n=${data.count ?? '?'})`,
    severity: 'nominal',
    raw: data,
  });
}

export async function pollEveU3(): Promise<AgentPollResult> {
  const url = 'https://api.genderize.io?name=alex';
  const data = await safeFetch<{ gender?: string; probability?: number }>(url);
  if (!data?.gender) return wrap('EVE-µ3', null);
  const p = data.probability ?? 0;
  const value = Number(p.toFixed(3));
  return wrap('EVE-µ3', {
    agentName: 'EVE-µ3',
    source: 'Genderize · name signal',
    timestamp: new Date().toISOString(),
    value,
    label: `Genderize: alex → ${data.gender} (p=${p.toFixed(2)})`,
    severity: 'nominal',
    raw: data,
  });
}

export async function pollEveU4(): Promise<AgentPollResult> {
  const url = 'https://api.nationalize.io?name=smith';
  const data = await safeFetch<{ country?: Array<{ country_id: string; probability: number }> }>(url);
  const top = data?.country?.[0];
  if (!top) return wrap('EVE-µ4', null);
  const value = Number(top.probability.toFixed(3));
  return wrap('EVE-µ4', {
    agentName: 'EVE-µ4',
    source: 'Nationalize · surname geography',
    timestamp: new Date().toISOString(),
    value,
    label: `Nationalize “smith”: top ${top.country_id} (${(top.probability * 100).toFixed(1)}%)`,
    severity: 'nominal',
    raw: top,
  });
}

export async function pollEveU5(): Promise<AgentPollResult> {
  const url = 'https://randomuser.me/api/?results=5&nat=us';
  const data = await safeFetch<{ results?: unknown[] }>(url);
  const n = data?.results?.length ?? 0;
  const value = Number(normalizeDirect(n, 0, 5).toFixed(3));
  return wrap('EVE-µ5', {
    agentName: 'EVE-µ5',
    source: 'RandomUser · synthetic civic sample',
    timestamp: new Date().toISOString(),
    value,
    label: `RandomUser: pulled ${n} US profiles (public demo API)`,
    severity: 'nominal',
    raw: { count: n },
  });
}

/** All 40 instrument poll functions in family order */
export const ALL_INSTRUMENT_POLLS: Array<() => Promise<AgentPollResult>> = [
  pollAtlasU1,
  pollAtlasU2,
  pollAtlasU3,
  pollAtlasU4,
  pollAtlasU5,
  pollZeusU1,
  pollZeusU2,
  pollZeusU3,
  pollZeusU4,
  pollZeusU5,
  pollHermesU1,
  pollHermesU2,
  pollHermesU3,
  pollHermesU4,
  pollHermesU5,
  pollAureaU1,
  pollAureaU2,
  pollAureaU3,
  pollAureaU4,
  pollAureaU5,
  pollJadeU1,
  pollJadeU2,
  pollJadeU3,
  pollJadeU4,
  pollJadeU5,
  pollDaedalusU1,
  pollDaedalusU2,
  pollDaedalusU3,
  pollDaedalusU4,
  pollDaedalusU5,
  pollEchoU1,
  pollEchoU2,
  pollEchoU3,
  pollEchoU4,
  pollEchoU5,
  pollEveU1,
  pollEveU2,
  pollEveU3,
  pollEveU4,
  pollEveU5,
];
