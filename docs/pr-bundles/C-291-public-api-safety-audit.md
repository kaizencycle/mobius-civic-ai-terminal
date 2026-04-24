# C-291 — Public API Safety + Audit Plan

## Purpose

Protect the Mobius Civic Mesh public data surface while preserving transparency.

Mobius should expose public meaning, live posture, and civic-readable signals without exposing operator controls, raw attack maps, secrets, or write-capable machinery.

Core rule:

> Public endpoints may explain state. Only authenticated service/operator routes may change state.

---

## Threat Model

A public viewer or attacker can see the Terminal and infer that Mobius has:

- agents
- public API routes
- cron lanes
- EPICON feed
- Journal and Ledger lanes
- KV / Redis state
- Civic Core ledger bridge
- Substrate canon path
- MIC / Vault lanes
- GI / MII / future ESI metrics

The main risk is not only server compromise. It is also epistemic poisoning:

```txt
Can someone influence the inputs?
Can someone trigger agents?
Can someone fake EPICON rows?
Can someone make GI/MII/ESI lie?
Can someone force duplicate writes?
Can someone cause stale or degraded UI state?
Can someone make hot data look canonical?
```

---

## Route Classification Model

Every route should be classified into one of four categories.

### 1. public-read

Safe to expose publicly when payloads are sanitized and rate-limited.

Examples:

- `/api/terminal/snapshot-lite`
- `/api/terminal/watermark`
- `/api/epicon/feed`
- `/api/vault/status` with public-safe payload
- `/api/integrity-status` with public-safe payload

Rules:

- `GET` only
- no mutation
- no secrets
- no raw stack traces
- no operator-only diagnostics
- cache/freshness headers explicit
- payload capped

### 2. operator-read

Requires an authenticated operator session or operator token.

Examples:

- lane diagnostics
- KV health details
- raw route inventory
- canon outbox details
- ZEUS Red Team findings
- raw EPICON payload inspection
- full Journal provenance

Rules:

- authenticated
- no public indexing
- no public cache
- safe error responses

### 3. service-write

Requires bearer/HMAC/service auth and idempotency.

Examples:

- EPICON create/publish/promote
- agent journal writes
- EVE synthesis writes
- ZEUS verify writes
- seal issue/finalize/reattest
- ledger backfill
- identity sync

Rules:

- `POST` only for mutation
- service auth required
- idempotency key required
- payload size limit
- provenance fields required
- audit log written
- no secrets returned

### 4. cron-write

Requires cron secret or platform-verified cron header.

Examples:

- sweep
- heartbeat
- vault attestation
- watchdog
- publish OAA snapshots

Rules:

- cron auth required
- idempotency required
- rate-limited
- safe no-op behavior on duplicate
- audit log written

---

## Public Endpoint Safety Rules

Public data endpoints should follow these rules.

```txt
1. Public GET routes never mutate state.
2. Public GET routes return public-safe packets, not raw internals.
3. Public payloads are capped by default.
4. Public payloads expose freshness, not secrets.
5. Public routes use explicit Cache-Control.
6. Public routes do not reveal stack traces or raw dependency errors.
7. Public routes do not expose token/config/env presence beyond safe boolean posture.
8. Public routes do not disclose private operator routing details.
9. Public routes include schema version and timestamp.
10. Public routes degrade safely.
```

---

## Write Endpoint Safety Rules

Write-capable routes should follow these rules.

```txt
1. Mutations use POST, not GET.
2. Require Authorization: Bearer <token> or HMAC signature.
3. Validate content-type and payload size.
4. Validate schema with zod or equivalent.
5. Require cycle, source, provenance, and idempotency key.
6. Reject duplicate idempotency keys safely.
7. Log audit event with route, action, actor, cycle, result, and timestamp.
8. Never return secrets.
9. Return stable error codes, not raw exceptions.
10. Require ZEUS/Jade verification before canon write when risk is elevated.
```

---

## Audit Event Shape

Every protected write should produce an audit event.

```json
{
  "type": "PUBLIC_API_AUDIT_V1",
  "route": "/api/epicon/create",
  "method": "POST",
  "classification": "service-write",
  "actor": "ZEUS",
  "cycle": "C-291",
  "idempotency_key": "epicon:create:...",
  "authorized": true,
  "result": "accepted",
  "risk": "watch",
  "timestamp": "2026-04-24T00:00:00.000Z"
}
```

Audit events may be written to hot state first, then ledger/canon after verification.

---

## Initial Route Inventory Targets

Routes discovered during C-291 scan that should be classified and audited.

### Public-read candidates

- `/api/terminal/snapshot`
- `/api/terminal/snapshot-lite`
- `/api/terminal/shell`
- `/api/echo/digest`
- `/api/epicon/feed`
- `/api/chambers/journal`
- `/api/chambers/ledger`
- `/api/chambers/globe`
- `/api/agents/journal`
- `/api/mii/feed`
- `/api/vault/status`
- `/api/integrity-status`
- `/api/tripwire/status`

### Operator-read candidates

- `/api/chambers/lane-diagnostics`
- `/api/kv/health`
- `/api/health/kv-permissions`
- `/api/agents/liveness`
- raw canon queue / outbox routes
- ZEUS Red Team findings

### Service-write candidates

- `/api/echo/ingest`
- `/api/epicon/create`
- `/api/epicon/publish`
- `/api/epicon/promote`
- `/api/agents/zeus/verify`
- `/api/zeus/verify`
- `/api/eve/synthesize`
- `/api/eve/pipeline-synthesize`
- `/api/eve/escalation-synthesize`
- `/api/seal/issue`
- `/api/seal/finalize`
- `/api/seal/reattest`
- `/api/vault/seal`
- `/api/ledger/backfill`
- `/api/identity/sync`

### Cron-write candidates

- `/api/cron/sweep`
- `/api/cron/heartbeat`
- `/api/cron/vault-attestation`
- `/api/cron/watchdog`
- `/api/cron/publish-oaa-snapshots`

### Admin candidates

- `/api/admin/seed-kv`
- `/api/admin/seed-ledger`

Admin routes should be disabled in production unless explicitly protected by operator/service auth.

---

## ZEUS Audit Duties

ZEUS should scan the route inventory each cycle and emit ESI.

```txt
ESI = Exposure Surface Index
```

Inputs:

- public route count
- write routes without service auth
- mutating GET routes
- public diagnostics exposure
- payload size risk
- stale cache risk
- raw error leak risk
- canon pending backlog
- failed verification count
- duplicate replay attempts

Output:

```txt
ZEUS PUBLIC API AUDIT — C-291
Risk: Watch / Elevated / Critical
Findings: [...]
Required Controls: [...]
```

---

## C-291 Recommended Controls

### Control 1 — Route Classification Manifest

Add a machine-readable route inventory:

```txt
lib/security/public-api-routes.ts
```

This should define:

```ts
{
  path: string;
  method: 'GET' | 'POST';
  classification: 'public-read' | 'operator-read' | 'service-write' | 'cron-write' | 'admin';
  mutates: boolean;
  auth: 'none' | 'operator' | 'bearer' | 'hmac' | 'cron';
  publicSafe: boolean;
  maxPayloadBytes?: number;
}
```

### Control 2 — Shared Auth Guard

Add shared helpers:

```txt
lib/security/apiAuth.ts
```

Expected helpers:

```ts
requireBearerAuth(request)
requireCronAuth(request)
requireOperatorAuth(request)
extractActor(request)
```

### Control 3 — Safe Error Helper

Add standardized safe responses:

```txt
lib/security/safeResponse.ts
```

Expected helpers:

```ts
safeJson(data, status)
safeError(code, status)
noStoreJson(data)
```

### Control 4 — Audit Writer

Add:

```txt
lib/security/auditEvent.ts
```

Expected behavior:

- write lightweight audit event to KV
- optionally forward to Civic Core after verification
- never include secrets
- include idempotency key if present

### Control 5 — Public Packet Endpoints

Move public UI to packet endpoints:

```txt
/api/public/status
/api/public/chambers
/api/public/sentinel
```

These should return summarized safe state, while operator routes keep deeper diagnostics.

---

## Acceptance Criteria

- [ ] Every API route is classified.
- [ ] No mutating route is public GET.
- [ ] Public routes return sanitized packets only.
- [ ] Write routes require bearer/HMAC/cron auth.
- [ ] Write routes require idempotency keys where replay is possible.
- [ ] Admin routes are blocked or operator-auth protected in production.
- [ ] ZEUS can compute ESI from route inventory.
- [ ] Public mode does not expose operator route diagnostics.
- [ ] Operator mode can inspect audit events.
- [ ] Audit events do not include secrets or raw stack traces.

---

## Non-Goals

- [ ] Do not remove public transparency.
- [ ] Do not expose raw operator diagnostics publicly.
- [ ] Do not run destructive red-team tests in production.
- [ ] Do not make ESI replace GI.
- [ ] Do not make public UI depend on privileged endpoints.

---

## Canon

Transparency is not the same as control.

The public may see the weather report.
The operator may see the radar station.
ZEUS audits the doors.
JADE seals the truth.

We heal as we walk.
