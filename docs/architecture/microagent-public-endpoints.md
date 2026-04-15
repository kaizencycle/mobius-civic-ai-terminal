# Microagent public endpoints (40 instruments)

Canonical mapping for `lib/agents/micro/instrument-polls.ts`: eight parent families × five bounded instruments. Each row is a **public HTTP API** (no Mobius-specific keys unless noted). Third-party terms and rate limits apply; this list is for operator transparency, not a guarantee of availability.

Curated public API indexes: [public-apis/public-apis](https://github.com/public-apis/public-apis), [public-api-lists/public-api-lists](https://github.com/public-api-lists/public-api-lists).

## ATLAS (strategic / planetary)

| ID | Primary endpoint (representative) | Notes |
|----|-----------------------------------|--------|
| ATLAS-µ1 | `https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=8&mrnev=1` | World Bank open data |
| ATLAS-µ2 | `https://api.reliefweb.int/v1/disasters?appname=mobius-terminal&limit=8` | ReliefWeb API |
| ATLAS-µ3 | `https://restcountries.com/v3.1/alpha/us` | REST Countries |
| ATLAS-µ4 | `https://api.weather.gov/alerts/active?area=US` | NWS (requires identifiable User-Agent) |
| ATLAS-µ5 | `https://api.open-meteo.com/v1/forecast?latitude=40.66&longitude=-73.55&current=...` | Open-Meteo |

## ZEUS (verification / corroboration proxies)

| ID | Primary endpoint | Notes |
|----|------------------|--------|
| ZEUS-µ1 | `https://api.crossref.org/works?query=integrity+governance&rows=5` | Scholarly metadata |
| ZEUS-µ2 | `https://export.arxiv.org/api/query?search_query=all:verification&start=0&max_results=5` | arXiv Atom API |
| ZEUS-µ3 | `https://api.coincap.io/v2/assets?limit=8` | Market volatility proxy |
| ZEUS-µ4 | `https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY` | ECB-backed FX |
| ZEUS-µ5 | `https://openlibrary.org/search.json?q=governance&limit=5` | Open Library |

## HERMES (velocity / attention)

| ID | Primary endpoint | Notes |
|----|------------------|--------|
| HERMES-µ1 | `https://hacker-news.firebaseio.com/v0/topstories.json` + item JSON | HN Firebase API |
| HERMES-µ2 | `https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&...&origin=*` | Wikipedia RC |
| HERMES-µ3 | `https://api.gdeltproject.org/api/v2/doc/doc?query=governance&mode=artlist&...` | GDELT |
| HERMES-µ4 | `https://www.reddit.com/r/worldnews/hot.json?limit=8` | Reddit JSON |
| HERMES-µ5 | `https://api.spacexdata.com/v4/launches/upcoming` | SpaceX public API |

## AUREA (governance / institutions)

| ID | Primary endpoint | Notes |
|----|------------------|--------|
| AUREA-µ1 | `https://www.federalregister.gov/api/v1/documents.json?...` | Federal Register |
| AUREA-µ2 | `https://catalog.data.gov/api/3/action/package_search?rows=5&...` | data.gov CKAN |
| AUREA-µ3 | `https://api.fda.gov/drug/event.json?limit=5` | openFDA |
| AUREA-µ4 | `https://api.census.gov/data/2021/pep/natmonthly?get=POP,NAME&for=us:*` | US Census |
| AUREA-µ5 | `https://api.usaspending.gov/api/v2/references/toptier_agencies/?limit=10` | USAspending |

## JADE (memory / culture)

| ID | Primary endpoint | Notes |
|----|------------------|--------|
| JADE-µ1 | `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q42&format=json&origin=*` | Wikidata |
| JADE-µ2 | `https://api.quotable.io/random` | Quotable |
| JADE-µ3 | `https://collectionapi.metmuseum.org/public/collection/v1/objects/45734` | Met Museum |
| JADE-µ4 | `https://openlibrary.org/authors/OL23466A.json` | Open Library author |
| JADE-µ5 | `https://poetrydb.org/random/1` | Poetry DB |

## DAEDALUS (build / infra health)

| ID | Primary endpoint | Notes |
|----|------------------|--------|
| DAEDALUS-µ1 | `https://api.github.com/repos/vercel/next.js` | GitHub REST |
| DAEDALUS-µ2 | `https://registry.npmjs.org/react/latest` | npm registry |
| DAEDALUS-µ3 | `https://registry.npmjs.org/typescript/latest` | npm registry |
| DAEDALUS-µ4 | `https://status.npmjs.org/api/v2/status.json` | npm status |
| DAEDALUS-µ5 | `https://{VERCEL_URL}/api/integrity-status` | Self-ping (requires `VERCEL_URL` or `NEXT_PUBLIC_SITE_URL`) |

## ECHO (events / markets / environment)

| ID | Primary endpoint | Notes |
|----|------------------|--------|
| ECHO-µ1 | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&...` | CoinGecko |
| ECHO-µ2 | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson` | USGS feeds |
| ECHO-µ3 | NASA EONET (via `fetchEonetEvents` in codebase) | Shared EONET client |
| ECHO-µ4 | `https://api.open-notify.org/astros.json` | Open Notify |
| ECHO-µ5 | `https://api.nasa.gov/planetary/apod?api_key=...` | APOD (`NASA_APOD_KEY` or `DEMO_KEY`) |

## EVE (civic / demographic demos)

| ID | Primary endpoint | Notes |
|----|------------------|--------|
| EVE-µ1 | `https://datausa.io/api/data?drilldowns=Nation&measures=Population&year=latest` | Data USA |
| EVE-µ2 | `https://api.agify.io?name=alex` | Agify |
| EVE-µ3 | `https://api.genderize.io?name=alex` | Genderize |
| EVE-µ4 | `https://api.nationalize.io?name=smith` | Nationalize |
| EVE-µ5 | `https://randomuser.me/api/?results=5&nat=us` | RandomUser |

## Operator notes

- **EVE-µ2–µ5** are lightweight public demos, not civic ground truth; replace with governance-grade sources when wiring family journals.
- **GitHub** unauthenticated REST is rate-limited; heavy use may need a token (out of scope for keyless micro sweep).
- **Legacy four** (`pollGaia`, `pollHermes`, `pollThemis`, `pollDaedalus`) remain for tests; production `/api/signals/micro` uses `pollAllMicroAgents()`.
