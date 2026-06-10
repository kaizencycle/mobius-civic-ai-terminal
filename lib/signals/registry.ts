// C-306 FIX-511-01: 40-instrument signal registry with fallback chains.
// 6 agents · 40 instruments · all free public APIs.

export interface SignalInstrument {
  id: string;
  agent: 'GAIA' | 'HERMES' | 'THEMIS' | 'DAEDALUS' | 'AUREA' | 'ECHO';
  label: string;
  primary: string;
  fallback?: string;
  normalize: (data: unknown) => number; // 0-1 where 1 = healthy
  weight: number;
  timeoutMs?: number;
}

// ── GAIA: Environmental (8) ──────────────────────────────
const GAIA_INSTRUMENTS: SignalInstrument[] = [
  {
    id: 'gaia-weather-temp',
    agent: 'GAIA',
    label: 'Open-Meteo temperature anomaly',
    primary: 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current=temperature_2m&temperature_unit=celsius',
    normalize: (d: unknown) => {
      const t = (d as { current?: { temperature_2m?: number } })?.current?.temperature_2m;
      if (t == null) return 0;
      return t > 40 || t < -20 ? 0.2 : t > 35 || t < -10 ? 0.5 : 0.9;
    },
    weight: 1,
  },
  {
    id: 'gaia-earthquakes',
    agent: 'GAIA',
    label: 'USGS earthquake frequency',
    primary: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson',
    fallback: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson',
    normalize: (d: unknown) => {
      const count =
        (d as { metadata?: { count?: number } })?.metadata?.count ??
        (d as { features?: unknown[] })?.features?.length ?? 0;
      return count === 0 ? 1.0 : count <= 2 ? 0.7 : count <= 5 ? 0.4 : 0.1;
    },
    weight: 1.5,
  },
  {
    id: 'gaia-noaa-alerts',
    agent: 'GAIA',
    label: 'NOAA active weather alerts',
    primary: 'https://api.weather.gov/alerts/active?status=actual&message_type=alert&urgency=Immediate',
    fallback: 'https://api.weather.gov/alerts/active?status=actual&message_type=alert',
    normalize: (d: unknown) => {
      const count = (d as { features?: unknown[] })?.features?.length ?? 0;
      return count === 0 ? 1.0 : count <= 10 ? 0.8 : count <= 50 ? 0.6 : count <= 200 ? 0.4 : 0.2;
    },
    weight: 1,
  },
  {
    id: 'gaia-nasa-eonet',
    agent: 'GAIA',
    label: 'NASA EONET natural events',
    primary: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20&days=1',
    fallback: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20&days=3',
    normalize: (d: unknown) => {
      const count = (d as { events?: unknown[] })?.events?.length ?? 0;
      return count === 0 ? 1.0 : count <= 5 ? 0.85 : count <= 15 ? 0.65 : 0.4;
    },
    weight: 1,
  },
  {
    id: 'gaia-openaq',
    agent: 'GAIA',
    label: 'OpenAQ air quality',
    // C-337: OpenAQ v3 requires API key; replaced with Open-Meteo Air Quality API (free, no auth).
    primary: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=40.71&longitude=-74.01&current=us_aqi',
    normalize: (d: unknown) => {
      const aqi = (d as { current?: { us_aqi?: number } })?.current?.us_aqi;
      if (aqi == null) return 0.5;
      return aqi <= 50 ? 0.95 : aqi <= 100 ? 0.75 : aqi <= 150 ? 0.5 : aqi <= 200 ? 0.3 : 0.1;
    },
    weight: 0.8,
  },
  {
    id: 'gaia-space-weather',
    agent: 'GAIA',
    label: 'NOAA space weather Kp index',
    primary: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    normalize: (d: unknown) => {
      const arr = Array.isArray(d) ? (d as { kp_index?: number }[]) : [];
      const latest = arr[arr.length - 1];
      const kp = latest?.kp_index ?? 0;
      return kp <= 2 ? 1.0 : kp <= 4 ? 0.8 : kp <= 6 ? 0.5 : 0.2;
    },
    weight: 0.8,
  },
  {
    id: 'gaia-usgs-water',
    agent: 'GAIA',
    label: 'USGS water conditions',
    primary: 'https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=ny&parameterCd=00060&siteStatus=active',
    normalize: (d: unknown) => {
      const sites = (d as { value?: { timeSeries?: unknown[] } })?.value?.timeSeries?.length ?? 0;
      return sites > 0 ? 0.85 : 0.4;
    },
    weight: 0.7,
    timeoutMs: 5000,
  },
  {
    id: 'gaia-nws-status',
    agent: 'GAIA',
    label: 'NWS API health',
    primary: 'https://api.weather.gov/',
    normalize: (d: unknown) => (d as { status?: string })?.status === 'OK' ? 1.0 : 0.3,
    weight: 0.5,
  },
];

// ── HERMES: Information velocity (8) ─────────────────────
const HERMES_INSTRUMENTS: SignalInstrument[] = [
  {
    id: 'hermes-hn-velocity',
    agent: 'HERMES',
    label: 'Hacker News story velocity',
    primary: 'https://hacker-news.firebaseio.com/v0/topstories.json',
    normalize: (d: unknown) =>
      Array.isArray(d) && (d as unknown[]).length > 0
        ? Math.min((d as unknown[]).length / 500, 1)
        : 0.3,
    weight: 1,
  },
  {
    id: 'hermes-wiki-changes',
    agent: 'HERMES',
    label: 'Wikipedia recent changes',
    primary: 'https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=timestamp&rclimit=50&format=json&origin=*',
    normalize: (d: unknown) => {
      const count = (d as { query?: { recentchanges?: unknown[] } })?.query?.recentchanges?.length ?? 0;
      return Math.min(count / 50, 1);
    },
    weight: 1,
  },
  {
    id: 'hermes-arxiv',
    agent: 'HERMES',
    label: 'ArXiv new submissions',
    primary: 'https://export.arxiv.org/api/query?search_query=all&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending',
    normalize: (d: unknown) => {
      const text = typeof d === 'string' ? d : JSON.stringify(d);
      const entryCount = (text.match(/<entry>/g) ?? []).length;
      return entryCount > 0 ? 0.9 : 0.3;
    },
    weight: 0.8,
    timeoutMs: 6000,
  },
  {
    id: 'hermes-wikimedia-pageviews',
    agent: 'HERMES',
    label: 'Wikimedia pageview API health',
    primary: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/2026/01/01',
    fallback: 'https://wikimedia.org/api/rest_v1/',
    normalize: (d: unknown) => (d ? 0.85 : 0.3),
    weight: 0.7,
  },
  {
    id: 'hermes-internet-archive',
    agent: 'HERMES',
    label: 'Internet Archive availability',
    primary: 'https://archive.org/advancedsearch.php?q=mediatype:texts&rows=1&output=json',
    normalize: (d: unknown) =>
      ((d as { response?: { numFound?: number } })?.response?.numFound ?? 0) > 0 ? 0.9 : 0.3,
    weight: 0.8,
  },
  {
    id: 'hermes-openlibrary',
    agent: 'HERMES',
    label: 'OpenLibrary API health',
    primary: 'https://openlibrary.org/search.json?q=civic+intelligence&limit=3',
    normalize: (d: unknown) =>
      ((d as { numFound?: number })?.numFound ?? 0) > 0 ? 0.9 : 0.3,
    weight: 0.6,
  },
  {
    id: 'hermes-crossref',
    agent: 'HERMES',
    label: 'CrossRef publication velocity',
    primary: 'https://api.crossref.org/works?filter=from-created-date:2026-01-01&rows=5&sort=created&order=desc',
    normalize: (d: unknown) => {
      const total = (d as { message?: { 'total-results'?: number } })?.message?.['total-results'] ?? 0;
      return total > 0 ? 0.9 : 0.4;
    },
    weight: 0.7,
  },
  {
    id: 'hermes-hn-algolia',
    agent: 'HERMES',
    label: 'HN Algolia search health',
    primary: 'https://hn.algolia.com/api/v1/search?query=civic+integrity&tags=story&hitsPerPage=5',
    normalize: (d: unknown) =>
      ((d as { nbHits?: number })?.nbHits ?? 0) > 0 ? 0.85 : 0.3,
    weight: 0.6,
  },
];

// ── THEMIS: Governance (8) ───────────────────────────────
const THEMIS_INSTRUMENTS: SignalInstrument[] = [
  {
    id: 'themis-federal-register',
    agent: 'THEMIS',
    label: 'Federal Register rule count',
    primary: 'https://www.federalregister.gov/api/v1/documents.json?fields[]=document_number&per_page=5&order=newest',
    normalize: (d: unknown) =>
      ((d as { count?: number })?.count ?? 0) > 0 ? 0.9 : 0.3,
    weight: 1.5,
  },
  {
    id: 'themis-datagov',
    agent: 'THEMIS',
    label: 'data.gov dataset freshness',
    primary: 'https://catalog.data.gov/api/3/action/package_search?q=civic&rows=5&sort=metadata_modified+desc',
    // C-337: data.gov CKAN API intermittently down; fallback to data.gov status page API.
    fallback: 'https://catalog.data.gov/api/3/action/site_read',
    normalize: (d: unknown) => ((d as { success?: boolean })?.success ? 0.9 : 0.3),
    weight: 1,
  },
  {
    id: 'themis-congress',
    agent: 'THEMIS',
    label: 'Congress.gov bill activity',
    primary: 'https://api.congress.gov/v3/bill?format=json&limit=5&sort=updateDate+desc&api_key=DEMO_KEY',
    normalize: (d: unknown) =>
      ((d as { bills?: unknown[] })?.bills?.length ?? 0) > 0 ? 0.85 : 0.4,
    weight: 1,
  },
  {
    id: 'themis-worldbank',
    agent: 'THEMIS',
    label: 'World Bank API health',
    primary: 'https://api.worldbank.org/v2/country?format=json&per_page=1',
    normalize: (d: unknown) => (Array.isArray(d) && (d as unknown[]).length === 2 ? 0.9 : 0.3),
    weight: 0.8,
  },
  {
    id: 'themis-un-data',
    agent: 'THEMIS',
    label: 'UN Data API availability',
    // C-337: old SDMX dataflow URL broken; replaced with UN SDG Goals API (stable, free).
    primary: 'https://unstats.un.org/sdgapi/v1/sdg/Goal/List',
    normalize: (d: unknown) => (Array.isArray(d) && (d as unknown[]).length > 0 ? 0.85 : 0.3),
    weight: 0.8,
    timeoutMs: 8000,
  },
  {
    id: 'themis-oecd',
    agent: 'THEMIS',
    label: 'Eurostat EU economic data',
    // C-337: stats.oecd.org deprecated; sdmx.oecd.org also 403 in prod (cloud IP blocked).
    // Codex review: replaced with Eurostat public API (EU statistical office, no key, stable).
    primary: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tec00001?format=JSON&sinceTimePeriod=2022&lastTimePeriod=1',
    normalize: (d: unknown) => {
      const vals = (d as { value?: Record<string, unknown> })?.value;
      return vals && Object.keys(vals).length > 0 ? 0.85 : 0.3;
    },
    weight: 0.7,
    timeoutMs: 10000,
  },
  {
    id: 'themis-govtrack',
    agent: 'THEMIS',
    label: 'GovTrack legislation feed',
    primary: 'https://www.govtrack.us/api/v2/vote?limit=5&order_by=-created',
    normalize: (d: unknown) =>
      ((d as { objects?: unknown[] })?.objects?.length ?? 0) > 0 ? 0.85 : 0.3,
    weight: 0.8,
  },
  {
    id: 'themis-transparency-intl',
    agent: 'THEMIS',
    label: 'Transparency International API',
    primary: 'https://www.transparency.org/api/latest/scores',
    fallback: 'https://api.worldbank.org/v2/indicator/CC.EST?format=json&per_page=1',
    normalize: (d: unknown) => (d ? 0.8 : 0.3),
    weight: 0.8,
    timeoutMs: 6000,
  },
];

// ── DAEDALUS: Infrastructure (8) ────────────────────────
const DAEDALUS_INSTRUMENTS: SignalInstrument[] = [
  {
    id: 'daedalus-github',
    agent: 'DAEDALUS',
    label: 'GitHub API rate limit health',
    primary: 'https://api.github.com/rate_limit',
    normalize: (d: unknown) => {
      const rate = (d as { rate?: { remaining?: number; limit?: number } })?.rate;
      const remaining = rate?.remaining ?? 0;
      const limit = rate?.limit ?? 60;
      return limit > 0 ? remaining / limit : 0;
    },
    weight: 1.5,
  },
  {
    id: 'daedalus-npm',
    agent: 'DAEDALUS',
    label: 'npm registry health',
    primary: 'https://registry.npmjs.org/-/ping',
    normalize: (d: unknown) =>
      (d as { db_name?: string })?.db_name === 'registry' ? 1.0 : 0.3,
    weight: 1,
  },
  {
    id: 'daedalus-terminal-ping',
    agent: 'DAEDALUS',
    label: 'Terminal self-ping latency',
    primary: `${process.env.NEXT_PUBLIC_TERMINAL_URL ?? 'https://mobius-civic-ai-terminal.vercel.app'}/api/health/heartbeats`,
    normalize: (d: unknown) => ((d as { ok?: boolean })?.ok ? 1.0 : 0.3),
    weight: 2,
  },
  {
    id: 'daedalus-cloudflare-radar',
    agent: 'DAEDALUS',
    label: 'Cloudflare infrastructure status',
    // C-337: Radar BGP API requires auth token; replaced with Cloudflare public statuspage (no auth).
    // Label updated to match what the endpoint actually measures (overall CDN/infra health, not BGP hijacks).
    primary: 'https://www.cloudflarestatus.com/api/v2/status.json',
    normalize: (d: unknown) => {
      const indicator = (d as { status?: { indicator?: string } })?.status?.indicator;
      return indicator === 'none' ? 1.0 : indicator === 'minor' ? 0.7 : 0.3;
    },
    weight: 1,
    timeoutMs: 5000,
  },
  {
    id: 'daedalus-fastly-status',
    agent: 'DAEDALUS',
    label: 'Fastly CDN status',
    // C-337: fastlystatus.com moved to status.fastly.com (statuspage.io).
    primary: 'https://status.fastly.com/api/v2/status.json',
    normalize: (d: unknown) => {
      const indicator = (d as { status?: { indicator?: string } })?.status?.indicator;
      return indicator === 'none' ? 1.0 : indicator === 'minor' ? 0.7 : 0.3;
    },
    weight: 0.8,
  },
  {
    id: 'daedalus-crt-sh',
    agent: 'DAEDALUS',
    label: 'SSL Labs API health',
    // C-337: crt.sh times out at 10s+ on Vercel — consistently unusable. Replaced with
    // SSL Labs /api/v3/info (returns engine version; fast, free, no key, same infra-trust signal intent).
    primary: 'https://api.ssllabs.com/api/v3/info',
    normalize: (d: unknown) =>
      (d as { engineVersion?: string })?.engineVersion ? 0.9 : 0.3,
    weight: 0.7,
    timeoutMs: 5000,
  },
  {
    id: 'daedalus-pypi',
    agent: 'DAEDALUS',
    label: 'PyPI registry health',
    primary: 'https://pypi.org/pypi/requests/json',
    normalize: (d: unknown) =>
      (d as { info?: { name?: string } })?.info?.name === 'requests' ? 1.0 : 0.3,
    weight: 0.6,
  },
  {
    id: 'daedalus-lets-encrypt',
    agent: 'DAEDALUS',
    label: "Let's Encrypt ACME health",
    primary: 'https://acme-v02.api.letsencrypt.org/directory',
    normalize: (d: unknown) =>
      ((d as { newNonce?: string })?.newNonce ? 1.0 : 0.3),
    weight: 0.7,
  },
];

// ── AUREA: Civic/Economic (4) — new ─────────────────────
const AUREA_INSTRUMENTS: SignalInstrument[] = [
  {
    id: 'aurea-fred',
    agent: 'AUREA',
    label: 'FRED economic data health',
    // C-337: fredgraph.json requires key; DEMO key exhausted in prod. Replaced with World Bank
    // US unemployment rate (same economic signal, free, no key, same WB pattern already used elsewhere).
    primary: 'https://api.worldbank.org/v2/country/US/indicator/SL.UEM.TOTL.ZS?format=json&per_page=1&mrv=1',
    normalize: (d: unknown) => {
      const arr = d as unknown[];
      return Array.isArray(arr) && (arr[1] as unknown[])?.length > 0 ? 0.9 : 0.4;
    },
    weight: 1.2,
  },
  {
    id: 'aurea-worldbank-gdp',
    agent: 'AUREA',
    label: 'World Bank GDP data freshness',
    primary: 'https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=1&mrv=1',
    normalize: (d: unknown) => {
      const arr = d as unknown[];
      return Array.isArray(arr) && (arr[1] as unknown[])?.length > 0 ? 0.9 : 0.4;
    },
    weight: 1,
  },
  {
    id: 'aurea-coingecko',
    agent: 'AUREA',
    label: 'CoinGecko market health (risk proxy)',
    primary: 'https://api.coingecko.com/api/v3/ping',
    normalize: (d: unknown) =>
      (d as { gecko_says?: string })?.gecko_says === '(V3) To the Moon!' ? 0.85 : 0.3,
    weight: 0.8,
  },
  {
    id: 'aurea-exchangerate',
    agent: 'AUREA',
    label: 'Exchange rate API stability',
    primary: 'https://open.er-api.com/v6/latest/USD',
    normalize: (d: unknown) =>
      (d as { result?: string })?.result === 'success' ? 0.9 : 0.3,
    weight: 0.8,
  },
];

// ── ECHO: Scientific/Cultural (4) — new ─────────────────
const ECHO_INSTRUMENTS: SignalInstrument[] = [
  {
    id: 'echo-nasa',
    agent: 'ECHO',
    label: 'NASA APIs health',
    // C-337: DEMO_KEY is rate-limited (30 req/hr/IP) on shared Vercel egress — exhausted in prod.
    // NASA Image Library API requires no key at all and is not rate-limited by IP.
    primary: 'https://images-api.nasa.gov/search?q=earth&media_type=image&page_size=1',
    normalize: (d: unknown) => {
      const hits = (d as { collection?: { metadata?: { total_hits?: number } } })?.collection?.metadata?.total_hits ?? 0;
      return hits > 0 ? 1.0 : 0.3;
    },
    weight: 1,
  },
  {
    id: 'echo-pubmed',
    agent: 'ECHO',
    label: 'PubMed publication rate',
    primary: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=artificial+intelligence&retmax=5&format=json',
    normalize: (d: unknown) => {
      const count = parseInt(
        (d as { esearchresult?: { count?: string } })?.esearchresult?.count ?? '0',
        10,
      );
      return count > 0 ? 0.9 : 0.3;
    },
    weight: 0.8,
    timeoutMs: 6000,
  },
  {
    id: 'echo-gbif',
    agent: 'ECHO',
    label: 'GBIF biodiversity data health',
    primary: 'https://api.gbif.org/v1/occurrence/search?limit=1',
    normalize: (d: unknown) =>
      ((d as { count?: number })?.count ?? 0) > 0 ? 0.9 : 0.3,
    weight: 0.8,
  },
  {
    id: 'echo-dataverse',
    agent: 'ECHO',
    label: 'Harvard Dataverse research health',
    primary: 'https://dataverse.harvard.edu/api/search?q=civic&per_page=1&type=dataset',
    normalize: (d: unknown) =>
      ((d as { data?: { total_count?: number } })?.data?.total_count ?? 0) > 0 ? 0.85 : 0.3,
    weight: 0.7,
    timeoutMs: 8000,
  },
];

export const SIGNAL_REGISTRY: SignalInstrument[] = [
  ...GAIA_INSTRUMENTS,
  ...HERMES_INSTRUMENTS,
  ...THEMIS_INSTRUMENTS,
  ...DAEDALUS_INSTRUMENTS,
  ...AUREA_INSTRUMENTS,
  ...ECHO_INSTRUMENTS,
];

export const AGENT_WEIGHTS: Record<string, number> = {
  GAIA:     0.20,
  HERMES:   0.18,
  THEMIS:   0.22,
  DAEDALUS: 0.20,
  AUREA:    0.12,
  ECHO:     0.08,
};

export const INSTRUMENT_COUNT = SIGNAL_REGISTRY.length; // 40
