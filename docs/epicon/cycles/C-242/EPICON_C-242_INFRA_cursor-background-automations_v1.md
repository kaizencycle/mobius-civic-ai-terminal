---
epicon_id: EPICON_C-242_INFRA_cursor-background-automations_v1
title: "Cursor Background Agent Automations — Seven Integrity Enforcement Loops"
author_name: "ATLAS Agent"
author_wallet: ""
cycle: "C-242"
epoch: ""
tier: "SUBSTRATE"
scope:
  domain: "infrastructure"
  system: "ci-automation"
  environment: "mainnet"
epicon_type: "infrastructure"
status: "active"
related_prs: []
related_commits: []
related_epicons:
  - "EPICON_C-238_INFRA_trust-layer-formalization_v1"
tags:
  - "cursor"
  - "automation"
  - "integrity-enforcement"
  - "background-agent"
  - "CI"
  - "EPICON-guard"
  - "sentinel"
integrity_index_baseline: 0.94
risk_level: "medium"
created_at: "2026-03-04T10:00:00Z"
updated_at: "2026-03-04T10:00:00Z"
version: 1
hash_hint: ""
summary: "Configured seven Cursor Background Agent automations covering EPICON ledger integrity, PR checklist enforcement, broken link detection, schema drift, sentinel personality guard, onboarding sync, and Turborepo pipeline health"
---

# EPICON C-242: Cursor Background Agent Automations

- **Layer:** SUBSTRATE > infrastructure > ci-automation
- **Author:** ATLAS Agent (+Michael Judan)
- **Date:** 2026-03-04
- **Status:** Active

## Context

The Mobius-Substrate monorepo had grown to a scale where manual integrity enforcement was no longer sustainable. PR reviews required checking EPICON compliance, link validity, schema consistency, and sentinel configuration across dozens of files. Human-only review was becoming a bottleneck and a source of drift.

## What Changed

Seven Cursor Background Agent automations were configured:

1. **EPICON Ledger Integrity** — validates that all EPICON entries have correct frontmatter, valid cycle references, and consistent status fields
2. **PR Checklist Enforcement** — ensures every PR includes EPICON justification, scope declaration, and counterfactual conditions
3. **Broken Link Detection** — scans documentation for internal links pointing to paths that no longer exist (post-reorganization drift)
4. **Schema Drift** — compares JSON schemas against actual data structures to detect divergence
5. **Sentinel Personality Guard** — validates that sentinel agent configurations maintain their defined roles and don't drift toward generic behavior
6. **Onboarding Sync** — checks that START_HERE.md, CONTRIBUTING.md, and README.md stay consistent with each other
7. **Turborepo Pipeline Health** — monitors build pipeline for failures, cache misses, and dependency resolution issues

## Design Decision

Initial implementation used a single polling schedule for all seven automations. This was subsequently split into event-driven automations to reduce unnecessary computation and improve response time — each automation triggers only on relevant file changes.

## Impact

- Reduced PR review time by catching integrity issues before human review
- Prevented post-C-199 reorganization link rot from accumulating
- Established automated guardrails for the sentinel personality system
- Created a model for how Mobius infrastructure self-monitors

## Integrity Notes

- **MII impact:** Positive — automated enforcement reduces human error in integrity maintenance
- **GI impact:** +0.01 — infrastructure health monitoring improves system reliability
- **Risk:** Medium — automation failures could create false confidence; monitoring the monitors is essential

> "We heal as we walk." — Mobius Substrate
