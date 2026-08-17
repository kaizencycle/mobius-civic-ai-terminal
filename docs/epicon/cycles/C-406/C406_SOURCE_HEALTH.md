# C-406 Source Health Findings

**Scan cutoff:** 2026-08-17T12:04:35Z  
**Registry:** `lib/signals/registry.ts` (40 instruments)

---

## Priority instruments

### echo-dataverse (ECHO)

| Setting | Value |
|---|---|
| Endpoint | `dataverse.harvard.edu/api/search` |
| Timeout | 8000 ms |
| Fallback | none |
| Retry | 1 primary retry |
| Weight | 0.7 / agent total 3.3 |
| Max GI drag (hard fail) | ~0.017 |
| Status | **Persistent elevated** (~0.3) |

### gaia-usgs-water (GAIA)

| Setting | Value |
|---|---|
| Endpoint | USGS NWIS IV JSON |
| Timeout | 5000 ms |
| Fallback | none |
| Retry | 1 → ~10s failure window observed |
| Weight | 0.7 / agent total 7.3 |
| Max GI drag | ~0.019 |
| Status | **Intermittent timeout** (transient in latest ZEUS) |

### daedalus-cloudflare-radar (DAEDALUS)

| Setting | Value |
|---|---|
| Endpoint | cloudflarestatus.com API |
| Timeout | 5000 ms |
| Fallback | none |
| Weight | 1.0 / agent total 8.3 |
| Max GI drag | ~0.024 |
| Status | **Persistent watch** (~0.7) |

### hermes-internet-archive (HERMES)

| Setting | Value |
|---|---|
| Endpoint | archive.org advancedsearch |
| Timeout | 4000 ms (default) |
| Fallback | none |
| Weight | 0.8 / agent total 6.2 |
| Max GI drag | ~0.023 |
| Status | **Elevated in latest ATLAS** |

### themis-federal-register (THEMIS)

| Setting | Value |
|---|---|
| Endpoint | federalregister.gov API |
| Timeout | 4000 ms (default) |
| Fallback | none |
| Weight | **1.5** (highest of five) |
| Max GI drag | ~0.045 |
| Status | Elevated in ATLAS snapshot |

---

## Shared behavior

- No unbounded retries (`lib/signals/fetcher.ts`)
- Error instruments score 0 — real failure, not masked
- Micro route caches 60s — ATLAS may lag live failures
- Combined max drag if all five fail simultaneously: ~0.13 GI (upper bound)

---

## Engineering scope (C-406)

This cycle **documents** source health and GI impact. Lane repair (timeout tuning, fallback chains) is follow-on — not masked by forcing healthy scores.

### Recovered

- hermes-openlibrary — recovered in latest ZEUS live comparison

---

## Operator note

Source failure affects live micro GI immediately. KV-backed GI may lag up to sweep/cache windows. Use `gi_representation` on both endpoints to compare timing, not assume corruption.
