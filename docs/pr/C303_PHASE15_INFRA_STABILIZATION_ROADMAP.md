# C-303 Phase 15 — Infrastructure Stabilization Roadmap

## Branch

`c303-phase15-infra-stabilization-roadmap`

## Base

`main`

## Purpose

Transition Mobius from hydration-heavy UI architecture into protocol-grade integrity infrastructure.

This PR is intentionally documentation-first and merge-safe. It defines the next implementation roadmap without changing runtime behavior.

## Strategic Principle

Mobius is not a dashboard. It is an operator-grade civic integrity substrate.

Truth must originate from canonical data layers, not client hydration timing.

## Current Problem Register

1. **Self-fetch recursion** — server components and SSR paths still risk calling internal HTTP endpoints instead of direct library access.
2. **Journal truth fragmentation** — truth exists in KV / ECHO / ledger lanes, but routing and indexing can return empty UI states.
3. **Chamber SSR degradation** — client-only bailout can hide initial integrity context.
4. **Canonical authority ambiguity** — `github`, `ledgerApi`, `kv`, and `echo` coexist without explicit trust weighting.
5. **Substrate attestation instability** — sealed blocks can exist locally before canonical anchoring succeeds.

---

## 10-Phase Execution Plan

### Phase 1 — Data Access Layer Foundation

Create a canonical `/lib/dal/` query layer.

Planned files:

- `lib/dal/vault.ts`
- `lib/dal/signals.ts`
- `lib/dal/snapshot.ts`
- `lib/dal/ledger.ts`
- `lib/dal/journal.ts`
- `lib/dal/sentinel.ts`

Replace internal self-fetch patterns with direct calls such as:

```ts
import { getVaultSnapshot } from '@/lib/dal/vault';
```

Acceptance:

- No server component depends on internal HTTP for core chamber state.
- Runtime behavior remains unchanged during extraction.

---

### Phase 2 — Canonical Snapshot Unification

Create a shared snapshot loader:

- `lib/dal/getCanonicalSnapshot.ts`

Responsibilities:

- GI
- cycle
- vault
- sentinel
- ledger
- journal
- pulse
- provenance

Acceptance:

- Chambers consume a shared typed snapshot shape.
- Snapshot derivation is testable outside React.

---

### Phase 3 — SSR Shell Stabilization

Stabilize initial render for operator chambers:

- Vault
- Signals
- Sentinel
- Ledger
- Pulse
- Journal

Server-render:

- GI
- cycle
- block status
- quorum state
- timestamps
- degraded state

Hydrate only interactive enhancements.

Acceptance:

- First paint includes meaningful integrity state.
- No silent blank chamber when data exists.

---

### Phase 4 — Chamber Metadata Canon

Create a chamber metadata helper for:

- title
- canonical URL
- description
- OG metadata
- Twitter metadata

Acceptance:

- Each chamber has isolated, predictable metadata.
- No duplicated title logic across routes.

---

### Phase 5 — Provenance & Trust Layer

Expose source lineage for operator review.

Initial sources:

- `github`
- `ledgerApi`
- `kv`
- `echo`

Add per-item metadata:

- source
- trust score
- timestamp
- replay status
- attestation state

Acceptance:

- UI can explain where a value came from.
- Future trust weighting has stable fields.

---

### Phase 6 — Journal Recovery System

Prevent silent Journal lane failure.

Fallback chain:

1. canonical substrate
2. KV journals
3. ECHO state
4. explicit empty degraded state

Acceptance:

- Journal lane never reports false empty when fallback data exists.
- UI shows which source is active.

---

### Phase 7 — Integrity Visualization Layer

Standardize severity language across chambers.

States:

- `nominal`
- `watch`
- `warning`
- `critical`
- `quarantined`

Acceptance:

- Same severity means the same thing across Vault, Signals, Ledger, Sentinel, and Pulse.
- No UI-derived truth.

---

### Phase 8 — Quorum & Seal Observability

Expose seal and quorum state transparently.

Add panels for:

- attested seals
- quarantined seals
- pending seals
- replay conflicts
- reattestation queue
- missing agents
- timeout reasons

Acceptance:

- Operators can explain why a block is attested, quarantined, pending, or legacy.

---

### Phase 9 — Substrate Attestation Hardening

Make canonical ledger routing deterministic.

Rules:

- Ledger target must resolve to Civic Protocol Core.
- GitHub URLs must never be treated as ledger API bases.
- Missing or invalid env values must degrade loudly, not silently succeed.

Acceptance:

- No GitHub HTML/JSON appears in Vault substrate errors.
- Seal writes show clear success or actionable failure.

---

### Phase 10 — Integrity Enforcement Layer

Move from observability to active enforcement.

Planned controls:

- replay rejection
- duplicate seal rejection
- stale payload rejection
- quorum weighting
- source confidence
- canonical promotion path

Canonical path:

```text
pending → verified → attested → sealed
```

Acceptance:

- Invalid or replayed entries cannot silently promote.
- Operators can inspect every rejection reason.

---

## Validation Plan

Required before implementation PRs merge:

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm lint
```

For this documentation-only PR:

- No runtime code changed.
- No validation commands were required by the file change itself.
- Implementation PRs must report typecheck, build, and lint honestly.

## Merge Safety

This PR is safe to merge because it only adds a roadmap document under `docs/pr/`.

## Follow-up Implementation Order

1. DAL foundation
2. Snapshot unification
3. SSR stabilization
4. Journal recovery
5. Metadata canon
6. Provenance layer
7. Integrity visualization
8. Quorum observability
9. Substrate hardening
10. Integrity enforcement
