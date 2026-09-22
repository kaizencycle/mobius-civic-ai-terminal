/**
 * lib/net/egress-authority.ts — C-442 Agent Egress Observability (ZEUS deliverable).
 *
 * Declares the expected-egress policy: for each known destination host, what
 * authority relationship is expected, which methods, and what credential
 * class. This is a classification matrix, not an enforcement mechanism —
 * OBSERVE phase records the classification, it does not act on it.
 *
 * Every entry here is derived directly from the C-442 HERMES inventory
 * (docs/architecture/network-egress-inventory-c442.md) and the pre-existing
 * docs/architecture/microagent-public-endpoints.md — not invented. A
 * destination not listed here defaults to `expected: false, authority:
 * 'UNRESOLVED'` (see `classifyDestination` in ./egress-anomaly.ts), per the
 * C-442 handoff: "Unknown destinations should default to expected = FALSE,
 * authority = UNRESOLVED."
 */

export interface EgressAuthorityEntry {
  /** Exact host or a `*.suffix` wildcard. */
  host: string;
  authority: string;
  methods: readonly string[];
  credentials: 'none' | 'service_token' | 'api_key' | 'oauth' | 'unknown';
  expected: true;
  notes?: string;
}

export const EGRESS_AUTHORITY_MATRIX: readonly EgressAuthorityEntry[] = [
  // ── Civic Protocol Core ledger / identity / MIC ──────────────────────────
  {
    host: 'civic-protocol-core-ledger.onrender.com',
    authority: 'LEDGER_READ_WRITE',
    methods: ['GET', 'POST'],
    credentials: 'service_token',
    expected: true,
    notes: 'lib/substrate/client.ts, lib/terminal/attest.ts, lib/cpc/hashAnchor.ts, lib/vault-v2/*',
  },
  {
    host: 'mobius-identity-service.onrender.com',
    authority: 'IDENTITY_AUTH',
    methods: ['GET', 'POST'],
    credentials: 'unknown',
    expected: true,
    notes: 'lib/substrate/identityToken.ts — login mints the ledger-attest bearer JWT',
  },

  // ── OAA sovereign-memory broker ──────────────────────────────────────────
  {
    host: 'oaa-api-library.onrender.com',
    authority: 'OAA_BRIDGE_READ_WRITE',
    methods: ['GET', 'POST'],
    credentials: 'service_token',
    expected: true,
    notes: 'lib/kv/kvBridgeClient.ts, lib/oaa/publishSnapshot.ts, lib/mesh/ingestClient.ts',
  },

  // ── Evidence / thought broker ─────────────────────────────────────────────
  {
    host: 'thought-broker.onrender.com',
    authority: 'EVIDENCE_READ_WRITE',
    methods: ['GET', 'POST'],
    credentials: 'api_key',
    expected: true,
    notes: 'lib/evidence/brokerClient.ts',
  },

  // ── GitHub (multiple token chains; content + Actions API) ────────────────
  {
    host: 'api.github.com',
    authority: 'GITHUB_API',
    methods: ['GET', 'POST', 'PUT'],
    credentials: 'service_token',
    expected: true,
    notes: 'lib/github-state-cache.ts, lib/dat/dispatchCanonExport.ts, lib/substrate/github-reader.ts',
  },
  {
    host: 'raw.githubusercontent.com',
    authority: 'GITHUB_RAW_READ',
    methods: ['GET'],
    credentials: 'none',
    expected: true,
    notes: 'lib/dat/substrateCanonGap.ts — public unauthenticated raw-content read',
  },

  // ── LLM providers ──────────────────────────────────────────────────────
  {
    host: 'api.anthropic.com',
    authority: 'LLM_INFERENCE',
    methods: ['POST'],
    credentials: 'api_key',
    expected: true,
    notes: 'app/api/cron/swarm, lib/eve/synthesize-claude.ts, lib/integrity/claude.ts',
  },
  {
    host: 'api.deepseek.com',
    authority: 'LLM_INFERENCE',
    methods: ['POST'],
    credentials: 'api_key',
    expected: true,
    notes: 'app/api/cron/swarm — default OPENAI_COMPAT_BASE_URL, tier-1',
  },
  {
    host: 'api.perplexity.ai',
    authority: 'LLM_INFERENCE',
    methods: ['POST'],
    credentials: 'api_key',
    expected: true,
    notes: 'lib/signals/perplexity-sonar.ts — querySonar(), PERPLEXITY_API_KEY sent as a Bearer token',
  },

  // ── Slack ──────────────────────────────────────────────────────────────
  {
    host: 'slack.com',
    authority: 'SLACK_REPLY',
    methods: ['POST'],
    credentials: 'service_token',
    expected: true,
    notes: 'lib/slack-agent/postSlackReply.ts',
  },

  // ── Image generation ───────────────────────────────────────────────────
  {
    host: 'api.replicate.com',
    authority: 'IMAGE_GENERATION',
    methods: ['POST'],
    credentials: 'oauth',
    expected: true,
    notes: 'lib/globe/renderProviders/nanoBanana.ts (NANO_BANANA_BASE_URL, default host not confirmed — see open question)',
  },

  // ── Market data ────────────────────────────────────────────────────────
  { host: 'finviz.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true, notes: 'lib/markets/finvizAdapter.ts (HTML scrape)' },
  { host: 'api.fiscaldata.treasury.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true, notes: 'lib/treasury/*' },
  { host: 'api.coingecko.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.coincap.io', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.frankfurter.app', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },

  // ── News / civic signal (the C-442 evidence-trigger destination) ─────────
  { host: 'api.gdeltproject.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true, notes: 'lib/eve/global-news.ts, lib/agents/micro/hermes.ts, lib/agents/micro/instrument-polls.ts' },
  { host: 'en.wikipedia.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'www.wikidata.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'hacker-news.firebaseio.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'hn.algolia.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'www.reddit.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'www.govtrack.us', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'www.federalregister.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'catalog.data.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.gsa.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'api_key', expected: true, notes: 'lib/agents/micro/themis.ts — only micro-agent using an API key' },
  { host: 'api.census.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.usaspending.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.fda.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.crossref.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'export.arxiv.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.semanticscholar.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.core.ac.uk', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'openlibrary.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'collectionapi.metmuseum.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'poetrydb.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.quotable.io', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },

  // ── World / climate / disaster data ───────────────────────────────────
  { host: 'api.worldbank.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.reliefweb.int', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'restcountries.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.weather.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.open-meteo.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'air-quality-api.open-meteo.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'earthquake.usgs.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'waterservices.usgs.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'eonet.gsfc.nasa.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.nasa.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'api_key', expected: true, notes: 'NASA_APOD_KEY or public DEMO_KEY' },
  { host: 'api.open-notify.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.spacexdata.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'services.swpc.noaa.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.gbif.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'dataverse.harvard.edu', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'eutils.ncbi.nlm.nih.gov', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'archive.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true, notes: 'lib/agents/micro/jade-internet-archive.ts — fixed query, checks this app\'s own domain' },

  // ── Identity / demographic demo APIs ──────────────────────────────────
  { host: 'datausa.io', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.agify.io', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.genderize.io', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'api.nationalize.io', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'randomuser.me', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },

  // ── Build / infra health ────────────────────────────────────────────────
  { host: 'registry.npmjs.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'status.npmjs.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'pypi.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'www.cloudflarestatus.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'www.netlifystatus.com', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },
  { host: 'acme-v02.api.letsencrypt.org', authority: 'SIGNAL_READ', methods: ['GET'], credentials: 'none', expected: true },

  // ── Upstash KV (every KV op is itself an outbound HTTP REST call) ────────
  { host: 'upstash.io', authority: 'KV_READ_WRITE', methods: ['GET', 'POST'], credentials: 'service_token', expected: true, notes: 'wildcard-style: actual hosts are *.upstash.io per KV_REST_API_URL' },

  // ── This app calling itself (self-referential, not third-party egress) ───
  { host: 'mobius-civic-ai-terminal.vercel.app', authority: 'SELF_REFERENTIAL', methods: ['GET', 'POST'], credentials: 'unknown', expected: true, notes: 'lib/watchdog/batchRepair/*, lib/dat/substrateCanonGap.ts — hardcoded production-origin fallback' },
] as const;
