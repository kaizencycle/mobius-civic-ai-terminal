---
epicon_id: EPICON_C-253_PRODUCT_signal-engine-v1_v1
title: "Signal Engine V1 — Real-Time Signal vs Narrative Divergence Scoring"
author_name: "ATLAS Agent"
author_wallet: ""
cycle: "C-253"
epoch: ""
tier: "PRODUCT"
scope:
  domain: "product"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "feature"
status: "active"
related_prs:
  - 10
  - 11
related_commits:
  - "a80bbcb"
  - "51f7460"
related_epicons:
  - "EPICON_C-249_PRODUCT_civic-ai-terminal-scaffold_v1"
tags:
  - "signal-engine"
  - "narrative"
  - "divergence"
  - "verification"
  - "iran"
  - "hormuz"
  - "geopolitical"
  - "real-time"
integrity_index_baseline: 0.93
risk_level: "medium"
created_at: "2026-03-17T10:06:00Z"
updated_at: "2026-03-17T15:00:00Z"
version: 1
hash_hint: ""
summary: "Built and deployed Signal Engine V1 — scores every EPICON event across signal (verification strength), narrative (amplification level), and volatility (system reaction) dimensions, classifying events as SIGNAL, EMERGING, or DISTORTION. First real-world test against Iran-Hormuz crisis intelligence."
---

# EPICON C-253: Signal Engine V1

- **Layer:** PRODUCT > civic-ai-terminal > signal-engine
- **Author:** ATLAS Agent (+Michael Judan)
- **Date:** 2026-03-17
- **Status:** Active

## Context

The Iran-Hormuz conflict created a real-time test case for Mobius. The Strait of Hormuz was under severe disruption, with verified shipping constraints and oil market stress coexisting alongside unverified narrative claims (yuan-only passage, immediate petrodollar collapse). The terminal needed a way to distinguish between what was verified and what was narrative amplification.

ZEUS analysis on the morning of C-253 established:
- **Verified:** Hormuz disruption is real, selective negotiated passage occurring, oil markets reacting
- **Not verified:** formal yuan-only passage regime, universal war tax in CNY

This signal-vs-narrative divergence became the design specification for the Signal Engine.

## What Changed

1. **Signal Engine scoring logic** (`lib/echo/signal-engine.ts`):
   - **Signal score** (0–1): verification strength based on confidence tier, source count, verification status, trace depth, hedging language detection
   - **Narrative score** (0–1): amplification level based on keyword detection (collapse, WW3, unprecedented, etc.), emotional language, category weighting, confidence-severity mismatch
   - **Volatility score** (0–1): system reaction intensity based on category, trace activity, and event status
   - **Classification:** SIGNAL (verified, narrative proportional), EMERGING (real event, narrative elevated), DISTORTION (narrative dominates facts)
   - **Divergence metric:** narrative minus signal — when positive, narrative is ahead of verification

2. **Signal Engine Panel** (`components/terminal/SignalEnginePanel.tsx`):
   - Cycle health summary (signal/emerging/distortion counts + averages)
   - Per-event cards with three color-coded score bars
   - Classification badges with semantic colors
   - Divergence warnings when narrative exceeds signal by >10%

3. **Inspector view** for signal scores with full breakdown, divergence analysis, and explainer

4. **EVE-bot** — automated cycle rotation at midnight EST (PR #11)

## First Real-World Application

Three EPICON entries were recorded against the Iran-Hormuz crisis:

| Entry | Type | Signal Engine Classification |
|-------|------|----------------------------|
| C-253-E001 | Geopolitical / Energy / Currency | **EMERGING** — real disruption verified, yuan-only claims unverified |
| C-253-E002 | Market / Macro / Reflexive Signal | **EMERGING** — oil/gold/equity reactions real, "petrodollar collapse" narrative ahead of facts |
| C-253-E003 | Narrative / Information Warfare | **DISTORTION** — multi-layer narrative divergence exceeds verification depth |

## The Insight

The Signal Engine doesn't ask "is this true?" — it asks "is the world reacting proportionally to what's actually verified?" That's a fundamentally different question, and it's the question that matters for civic intelligence.

## Impact

- First automated signal-vs-narrative scoring in the Mobius ecosystem
- Demonstrated real-time utility against a live geopolitical crisis
- Established the three-dimensional scoring model (signal/narrative/volatility) that future versions will build upon
- Created the foundation for the Mobius Detection Engine described in the C-253 design document

## Integrity Notes

- **MII impact:** Positive — explicit narrative detection improves information integrity assessment
- **GI impact:** -0.03 (event-driven) — the Iran-Hormuz crisis itself degrades global integrity; the Signal Engine improves Mobius's ability to track that degradation
- **Risk:** Medium — signal scoring uses heuristic keyword matching; future versions should incorporate multi-source cross-validation and temporal pattern analysis

### What Would Confirm the Yuan-Shift Thesis (ZEUS Monitoring Conditions)

- Official policy announcement from Iran
- Multiple nations settling oil in CNY through Hormuz
- Central bank reserve shifts tied to energy trade
- Shipping contracts denominated in non-USD currencies

> "We heal as we walk." — Mobius Substrate
