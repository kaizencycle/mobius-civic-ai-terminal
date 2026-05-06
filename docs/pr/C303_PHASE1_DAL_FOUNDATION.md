# C-303 — Phase 1 DAL Foundation (Additive)

## Phase

Phase 1 — Data Access Layer Foundation

## Change Type

Additive only.

No runtime behavior changes.
No deletions.
No route rewrites.
No hydration rewrites.

---

# Objective

Extract canonical data access into `/lib/dal/*` so:

```text
UI -> DAL -> canonical source
```

replaces:

```text
UI -> API -> API -> hydration recursion
```

This phase introduces stable server-safe read boundaries.

---

# Architectural Problem

Current risk patterns:

## 1. Internal self-fetch recursion

Examples:

- server components fetching `/api/...`
- SSR routes depending on internal HTTP
- snapshot routes becoming indirect dependency graphs

This increases:

- hydration instability
- timeout chains
- duplicated parsing
- degraded-state ambiguity
- Vercel runtime variance

---

## 2. Canonical truth fragmentation

Truth currently exists across:

- KV
- ledger
- substrate
- ECHO
- runtime memory
- snapshot aggregators

without a stable canonical access contract.

---

## 3. Operator ambiguity

Current UI often cannot explain:

- where a value came from
- whether it is stale
- whether it is canonical
- whether it is replayed
- whether it is degraded

---

# DAL Rules

## Rule 1 — DAL is server-only truth access

DAL modules:

- may read KV
- may read ledger
- may read substrate
- may aggregate runtime state

DAL modules:

- may NOT depend on React
- may NOT depend on browser state
- may NOT depend on client hydration

---

## Rule 2 — DAL never invents truth

Allowed:

```ts
status: 'degraded'
```

Forbidden:

```ts
status: 'healthy' // inferred without proof
```

---

## Rule 3 — provenance is mandatory

Every DAL return shape should eventually support:

```ts
{
  source: 'kv' | 'ledger' | 'echo' | 'github';
  stale: boolean;
  timestamp: string | null;
}
```

---

# Initial DAL Layout

## Core modules

```text
lib/dal/
  vault.ts
  signals.ts
  snapshot.ts
  ledger.ts
  journal.ts
  sentinel.ts
```

---

# Planned Responsibilities

## `lib/dal/vault.ts`

Canonical reads for:

- reserve balance
- reserve blocks
- quorum state
- seal state
- hash coverage
- fountain readiness

Primary extraction targets:

- `app/api/vault/status/route.ts`
- `lib/vault/vault.ts`
- `lib/vault-v2/*`

---

## `lib/dal/snapshot.ts`

Canonical aggregate snapshot.

Will eventually power:

- `/api/terminal/snapshot`
- SSR chamber boot payloads
- operator hydration seed

Responsibilities:

- cycle
- GI
- degraded state
- vault summary
- sentinel summary
- ledger summary
- provenance map

---

## `lib/dal/journal.ts`

Journal lane recovery and normalization.

Responsibilities:

- lane reconciliation
- fallback ordering
- canonical parsing
- replay-aware reads
- degraded empty-state handling

---

## `lib/dal/ledger.ts`

Canonical ledger reads.

Responsibilities:

- substrate events
- attestation reads
- EPICON references
- replay verification
- canonical ledger normalization

---

## `lib/dal/signals.ts`

Signal aggregation normalization.

Responsibilities:

- signal freshness
- source ownership
- stale-state normalization
- provenance metadata

---

## `lib/dal/sentinel.ts`

Sentinel and quorum reads.

Responsibilities:

- quorum state
- attested agents
- degraded agents
- timeout analysis
- replay diagnostics

---

# Extraction Strategy

## DO NOT rewrite routes first

Correct sequence:

### Step 1

Extract pure functions.

### Step 2

Wrap with DAL.

### Step 3

Migrate API routes.

### Step 4

Migrate SSR.

### Step 5

Remove internal self-fetch.

---

# Highest Priority Targets

## Tier A

Most important routes:

```text
/api/terminal/snapshot
/api/echo/digest
/api/vault/status
```

Reason:

These routes currently influence:

- chamber hydration
- operator truth
- degraded-state visibility
- GI rendering
- vault integrity

---

## Tier B

```text
/api/chambers/ledger
/api/vault/seal/attest
/api/vault/seal/quorum
```

---

# Phase 1 Acceptance Criteria

## Required

- DAL directory introduced
- canonical naming established
- extraction boundaries documented
- no runtime regressions
- no route deletions
- no hydration regressions

## Forbidden

- no giant rewrites
- no client-side DAL usage
- no fake cached truth
- no silent fallback masking

---

# Validation Contract

Implementation PRs following this spec must run:

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm lint
```

and report:

- files changed
- commands run
- exact failures
- remaining issues

---

# Canonical Principle

Mobius cannot become protocol-grade infrastructure
until truth access is separated from rendering.

DAL is the beginning of that separation.
