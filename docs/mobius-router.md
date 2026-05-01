# Mobius Router — C-298

## Purpose

Route Mobius tasks across local and cloud compute without allowing unverified inference to become truth.

## Core Law

Local = throughput.
Cloud = truth anchor.
Ledger = final truth.

No local-only inference may write to Ledger, define Canon, finalize Replay, mutate Vault, or affect MIC/Fountain state.

## Routing Rules

| Condition | Route |
| --- | --- |
| Repetitive task | local |
| Background agent loop | local |
| Private data | local |
| High-impact decision | cloud |
| Affects Ledger/Canon/Replay/Vault/MIC | cloud+zeus |
| Ambiguous or mixed-risk | hybrid |

## Layer Mapping

| Layer | Default Compute |
| --- | --- |
| ECHO ingestion | local |
| HERMES routing | local |
| JADE annotation | local |
| DAEDALUS log parsing | local |
| ATLAS anomaly scan | local-to-cloud escalation |
| ZEUS verification | cloud+deterministic checks |
| AUREA strategy | cloud |
| EVE synthesis | hybrid |

## Enforcement

Ledger writes require cloud verification or ZEUS quorum.
Local inference can produce drafts, summaries, classifications, and candidate recommendations only.

## Phase 1 Boundary

C-298 Phase 1 is read-only. It records routing decisions but does not call models or mutate state.
