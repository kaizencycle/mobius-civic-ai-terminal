# Mobius Sensor Federation

**Status:** Architecture note (C-281 / C-282 bridge)  
**Companion:** [Microagent Family Spec v1](../protocols/microagent-family-spec-v1.md) · [Output schema v1](../protocols/microagent-output-schema-v1.json)

---

## One-line thesis

**Parent agents govern; microagents sense.** Together they form a **sensor federation** — not forty chatbots, but forty **bounded instruments** whose evidence parents synthesize into journals, verification, and attestation.

---

## Why this name

- **Council** = eight named sentinels reasoning in public.  
- **Federation** = eight **families**, each with aligned micro-collectors, normalized into a single evidence field for GI, MII, Vault corroboration, and EPICON quality.

The leap is **governability**: breadth without turning volume into noise (cadence, dedup, correlation tiers — see the spec).

---

## Data flow (conceptual)

```text
Source feed
  → Microagent (schema-validated evidence object)
  → Family buffer / evidence queue
  → Parent agent (dedupe, correlate, synthesize)
  → Journal · verification · promotion · snapshot · Vault inputs
```

Microagents **do not** write Mobius journals or mint MIC directly.

---

## Relation to today’s codebase

Today the Terminal already runs a **small** micro-sweep (GAIA, HERMES-µ, THEMIS, DAEDALUS-µ) feeding `/api/signals/micro` and snapshot lanes. This document names the **target** architecture for scaling that pattern to **up to five instruments per parent** without collapsing layers (see `AGENTS.md`: reasoning ≠ fact; operator truth).

---

## Build order (first 10 instruments)

See **§13** and **§18** in `microagent-family-spec-v1.md`. Summary:

1. **ZEUS-µ1** — fact-check / verification feeds  
2. **ZEUS-µ2** — contradiction detector  
3. **ZEUS-µ3** — financial verification (filings / guidance)  
4. **ZEUS-µ4** — source corroboration  
5. **ZEUS-µ5** — research / consensus signals  
6. **ECHO-µ1** — financial markets (extends today’s lane)  
7. **ECHO-µ2** — seismic / environmental (extends USGS/EONET surface)  
8. **ECHO-µ3** — energy  
9. **ECHO-µ4** — supply chain  
10. **ECHO-µ5** — labor  

Implementation remains **incremental** — each instrument is a fetch + classify + emit **evidence object** registered in the sweep; parents consume in synthesis only.

---

## Doctrine

Mobius does not become stronger because it has more agents. It becomes stronger because it has **more independent instruments** under **constitutional synthesis**.

*"You didn't just discover 8 × 5. You discovered the council can evolve into a sensor federation."*
