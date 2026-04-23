# Microagent Family Spec v1

**Mobius Sensor Federation — Genesis Draft**  
**Cycle:** C-281 / C-282 bridge  
**Status:** Architecture Spec v1  
**Author:** kaizencycle (with Cursor)  
**CC0 Public Domain**

**Artifacts:**

- Machine schema: [`microagent-output-schema-v1.json`](./microagent-output-schema-v1.json)  
- Architecture note: [`../architecture/mobius-sensor-federation.md`](../architecture/mobius-sensor-federation.md)

---

## 0. Core doctrine

- **Parent agents govern.** Synthesis, verification, escalation, constitutional interpretation, **journal authorship**, attestation.  
- **Microagents sense.** Fetch, classify, normalize, anomaly detection, **structured evidence only**.

A microagent is **not** a free-form narrator. It is a **bounded instrument**.

Mobius does not become stronger because it has more agents. It becomes stronger because it has **more independent instruments** under clear constitutional synthesis.

---

## 1. Why this layer exists

The stack already proves: live feeds → ingestion → parent reasoning → journals → GI / MII / Vault.

Goals of the family lattice:

1. Reduce overreliance on a few feeds.  
2. Make **corroboration** rigorous (cross-outlet, cross-domain, cross-family).  
3. Separate **signal gathering** from **synthesis**.  
4. Allow GI to become **multi-dimensional** over time (sub-indices before rewriting the global formula).  
5. Strengthen **Vault** deposit scoring via evidence diversity (aligned with [Vault-to-Fountain](./vault-to-fountain-protocol.md)).

---

## 2. Architecture model

```text
Source → Microagent → Family buffer / evidence queue → Parent agent → Journal / attestation / promotion → Ledger / snapshot / Vault
```

| Layer | Role |
|-------|------|
| **A — Source** | External API, RSS, repo, bulletin, market stream, civic signal. |
| **B — Microagent** | Single-purpose collector + classifier; emits **evidence object** only. |
| **C — Family buffer** | Normalized queue for one parent family (implementation TBD). |
| **D — Parent agent** | Dedupe, correlate, synthesize; writes **family-facing** journal when warranted. |
| **E — Protocol** | Snapshot, promotion, Vault, EPICON, future Fountain logic. |

---

## 3. Family model

- **8** parent agents.  
- **Up to 5** microagents per parent by default → **40** instruments **ceiling**, not day-one count.

Parents: ATLAS, ZEUS, HERMES, AUREA, JADE, DAEDALUS, ECHO, EVE.

---

## 4. Canonical family responsibilities (summary)

| Family | Focus |
|--------|--------|
| **ATLAS** | Geopolitical, institutional, sovereignty, constitutional drift, long-horizon stability. |
| **ZEUS** | Fact paths, contradiction, triangulation, claim verification, epistemic conflict. |
| **HERMES** | Prioritization, velocity, narrative acceleration, routing (µ already exists). |
| **AUREA** | Policy, civic strategy, governance coherence, long-arc oversight. |
| **JADE** | Precedent, memory coherence, terminology drift, citation integrity, context. |
| **DAEDALUS** | Repo / infra / dependency / model release / platform health (µ already exists). |
| **ECHO** | Raw event surface: markets, seismic, energy, supply chain, labor. |
| **EVE** | Democratic health, participation, inequality, narrative coherence, civilizational stress. |

---

## 5. Microagent object model

Every microagent emits the **minimum** JSON object defined in [`microagent-output-schema-v1.json`](./microagent-output-schema-v1.json).

**Required fields:** `id`, `family`, `microagent`, `domain`, `source`, `title`, `summary`, `severity`, `confidence`, `timestamp`, `provenance`, `contradiction_flag`, `parent_agent`, `cycle`.

**Optional:** `lat`, `lng`, `magnitude`, `symbol`, `policy_id`, `jurisdiction`, `related_ids`, `impact_hint`.

**Rule:** Weak provenance → **low confidence** (no silent boosting).

---

## 6. Operating rules

1. **Bounded scope** — one narrow job per microagent.  
2. **No public journals from microagents** — evidence objects only; parents write journals.  
3. **No direct MIC mint authority** — influence corroboration / scores; economics stays on parent + ledger rails.  
4. **Provenance first** — every row carries retrievable source metadata.  
5. **Contradiction visible** — `contradiction_flag: true` when conflict detected; no silent smoothing.

---

## 7. Parent synthesis rules

Parents must:

1. Collect family evidence.  
2. **Deduplicate correlated signals** (see §8).  
3. Score evidence quality.  
4. Weigh contradiction.  
5. Emit **at most one** family-level journal per cadence when warranted.  
6. Drive verification / escalation / promotion state explicitly.

Parent journal minimum (existing practice + future fields): observation, inference, recommendation, confidence, severity, **evidence count**, **contradiction summary**, **family attribution**.

---

## 8. Correlation and anti–double-counting

**Problem:** Five instruments reading the same underlying event must **not** count as five independent confirmations.

**Cluster by:** event id, source overlap, timestamp proximity, domain similarity, shared upstream origin.

**Corroboration tiers (Vault / verification weighting):**

| Tier | Meaning |
|------|--------|
| 0 | Same-source repetition |
| 1 | Same domain, different outlet |
| 2 | Different domain confirmation |
| 3 | Cross-family confirmation |
| 4 | Cross-family + historical consistency + independent instrumentation |

**Rule:** Only **Tier 2+** should materially boost Vault corroboration or verification confidence.

---

## 9. GI and MII dimensionalization (future-safe)

Today GI is largely a **single composite**. Target:

```text
GI (composite)
  ├── Integrity      (ZEUS + JADE families)
  ├── Ecology        (environmental / ECHO+GAIA-class surface)
  ├── Custodianship  (ATLAS + AUREA governance coherence)
  └── Infrastructure (DAEDALUS + HERMES system surface)
```

**v1 recommendation:** Compute and **expose family-level sub-indices** in diagnostics before changing `lib/gi/compute.ts` weights (that file remains **operator-locked** per `CURRENT_CYCLE.md`).

---

## 10. Vault scoring impact

Microagents improve journal merit inputs (see [Vault-to-Fountain](./vault-to-fountain-protocol.md)):

- **C** — corroboration (tiered, not raw count).  
- **S** — survival over time.  
- **D** — duplication penalty (cluster-aware).  
- **I** — impact when evidence links to promoted EPICON / operator action.

**Rule:** Stronger Vault deposits when evidence spans **independent families**, contradiction is low, source diversity is high, duplication is low, and later cycles **confirm** the parent recommendation.

---

## 11. Cadence and budget controls

Without limits, forty instruments become forty noise machines.

**Required controls:**

- Per-microagent refresh interval.  
- Per-family **max outputs per cycle**.  
- Per-source cooldown.  
- Duplicate suppression window.  
- Error backoff.  
- Rate / cost budget.

**Suggested defaults:**

- Max **5** outputs per microagent per cycle.  
- Duplicate suppression window **30** minutes.  
- Contradiction recheck window **15** minutes.  
- Parent synthesis **hourly** unless escalation (matches existing synthesis cadence patterns).

---

## 12–13. Implementation order

**Do not build 40 at once.**

| Phase | Focus |
|-------|--------|
| **1** | **ZEUS family** — verification, contradiction, corroboration (strengthens MIC / MII defensibility). |
| **2** | **ECHO family** — broaden economic + environmental raw EPICON surface. |
| **3** | **DAEDALUS + JADE** — substrate + memory integrity. |
| **4** | **ATLAS, EVE, HERMES, AUREA** expansion — strategic and governance richness after core sensing is stable. |

---

## 14. v1 target instrument set (first 10)

| # | Instrument | Domain (example) |
|---|------------|------------------|
| 1 | ZEUS-µ1 | Fact-check feeds |
| 2 | ZEUS-µ2 | Contradiction detector |
| 3 | ZEUS-µ3 | Financial verification (SEC / guidance) |
| 4 | ZEUS-µ4 | Source corroboration |
| 5 | ZEUS-µ5 | Research / consensus |
| 6 | ECHO-µ1 | Financial markets |
| 7 | ECHO-µ2 | Seismic / environmental |
| 8 | ECHO-µ3 | Energy |
| 9 | ECHO-µ4 | Supply chain |
| 10 | ECHO-µ5 | Labor |

This set alone materially upgrades Mobius before expanding other families.

---

## 15. Terminal implications (later)

- **Sentinel:** parent state + family evidence counts + contradiction counts + freshness.  
- **Pulse:** cross-family corroboration badge on promoted syntheses.  
- **Globe / World State:** family overlays, EPICON type layers, legend.  
- **Vault:** optional display of corroboration tier / cross-family weight (post–Fountain v1).

---

## 16. Failure modes

| Risk | Mitigation |
|------|------------|
| **Noise bloom** | Caps, parent filtering, duplicate suppression |
| **False corroboration** | Source lineage + correlation clustering |
| **Family drift** | Strict domain contracts + schema validation |
| **Authority creep** | Hard rule: only parents publish journals / economic actions |
| **Infra overload** | Staged rollout, cooldowns, event-driven refresh |

---

## 17. Canonical one-liners

- **Microagent:** bounded sensing instrument → structured evidence.  
- **Parent agent:** constitutional synthesizer → governs a family.  
- **Family:** parent + its instrument lattice.  
- **Sensor federation:** the full multi-family evidence field of Mobius.

---

## 18. Genesis-era doctrine

**Do not build 40 personalities. Build 40 instruments.**

---

## 19. Next implementation steps (engineering)

1. Register each new instrument in the micro sweep with **schema-validated** payloads.  
2. Pipe evidence into a **family buffer** (Redis or in-memory + KV, TBD) before parent synthesis.  
3. Extend parent cron / synthesis to **read buffer** and emit **one** journal when thresholds met.  
4. Add Sentinel / snapshot diagnostics for **evidence counts per family** before UI polish.

---

*"Mobius can evolve from a council into a sensor federation — if the lattice stays governable."*
