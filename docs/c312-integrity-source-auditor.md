# C-312 — Mobius Integrity Source Auditor

## Purpose

The Integrity Source Auditor lets Mobius observe public, operator-approved web sources and convert those observations into EPICON-ready integrity signals.

This is not a truth oracle.
This is not surveillance.
This is not an unrestricted crawler.

It records observable public-source metadata so Mobius agents can review it.

---

## Canonical Flow

```text
operator allowlist
→ HERMES source check
→ ATLAS anomaly review
→ ZEUS verification scoring
→ EVE ethics / overreach review
→ JADE context annotation
→ AUREA synthesis
→ EPICON signal
→ Pulse Chamber display
→ Ledger attestation only after review
```

---

## Agent Attachment

### HERMES — Source Auditor / Router
- fetches configured public sources
- records reachability, title, freshness hints, status code, content type
- never declares factual truth

### ATLAS — Integrity Sentinel
- identifies anomalies, stale sources, inaccessible pages, changed status posture

### ZEUS — Verification Authority
- scores confidence tier and checks whether the source needs corroboration

### EVE — Ethics / Boundary Watch
- rejects private, login-gated, personal, or overbroad collection targets

### JADE — Context Annotation
- explains the signal in operator-friendly language

### AUREA — Synthesis
- summarizes source posture for Pulse Chamber and C-cycle planning

---

## Guardrails

Allowed:
- official status pages
- public documentation
- public advisories
- public open-source project pages
- public institutional pages

Disallowed:
- login-gated pages
- personal accounts
- private data
- attempts to bypass access controls
- bulk harvesting
- covert collection

---

## EPICON Template

```yaml
epicon_id: EPICON_C-312_WEB_<source_slug>
type: integrity_signal
mode: observation_only
source: Mobius Integrity Source Auditor
owner_agent: HERMES
reviewers:
  - ATLAS
  - ZEUS
  - EVE
  - JADE
  - AUREA
status: needs_verification
claim_boundary: >
  This event proves Mobius observed public-source metadata at a time.
  It does not prove the underlying public claim is true.

evidence:
  source_url: <configured public URL>
  fetched_at: <ISO timestamp>
  http_status: <status code>
  content_type: <header value>
  title_observed: <page title or null>
  freshness_hint: fresh | stale | unknown
  signals:
    - public_source_reachable
    - title_observed
    - freshness_hint_present
  warnings:
    - source_appears_stale
    - source_unreachable
    - unsupported_content_type

agent_routing:
  hermes: route and collect source observation
  atlas: inspect anomaly posture
  zeus: assign confidence tier
  eve: confirm ethical boundary
  jade: annotate context
  aurea: synthesize operator summary

pulse_display:
  chamber: Pulse
  lane: integrity_source_auditor
  label: WEB INTEGRITY SIGNAL
```

---

## Pulse Chamber Display Contract

Pulse rows should show:

```text
WEB INTEGRITY SIGNAL
Source: <host>
Owner: HERMES
Review: ATLAS / ZEUS pending
Boundary: observation only
Score: <0.00-1.00>
Status: needs_verification
```

---

## First Implementation Slice

1. Add a bounded source-auditor library.
2. Add `/api/crawler/integrity-scan` for operator-triggered scans.
3. Add configured source ingestion via `MOBIUS_INTEGRITY_CRAWL_URLS`.
4. Convert observations into ECHO raw events.
5. Let existing ECHO → EPICON → Pulse path render them.

---

## Final Rule

EPICON proves the observation event.
Agents decide whether the observation deserves belief.
