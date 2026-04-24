# C-291 — HERMES Journal Router

## Purpose

Define the next Journal dataflow layer for Mobius.

The Journal now has three memory paths:

```txt
HOT    = KV / Upstash / immediate operational pulse
CANON  = Substrate / sealed durable memory
MERGED = Terminal-composed operator view across hot + canon + derived PR/EPICON context
```

The issue is not lack of data. The issue is shaping, filtering, deduping, and promoting data without flooding the UI or corrupting canon.

Core principle:

> HOT is fast. CANON is earned. MERGED is the operator view.

---

## Ideal Journal Flow

```txt
Agent observes event
  ↓
HOT write to KV
  ↓
HERMES normalizes into packet shape
  ↓
ATLAS assesses signal value
  ↓
ZEUS checks provenance / replay / poisoning risk
  ↓
JADE decides canon eligibility
  ↓
CANON write to Substrate
  ↓
Terminal reads MERGED view
  ↓
EVE synthesizes cycle / weekly digest
```

---

## Agent Duties

### ECHO — Intake

- Owns first-pass event intake.
- Writes operational observations to HOT.
- Does not decide canon.

### HERMES — Router / Normalizer

- Reads HOT, CANON, and derived context.
- Normalizes entries into a shared Journal Packet shape.
- Dedupe / groups duplicate rows.
- Computes hidden-by-filter and visible counts.
- Marks canon candidates.
- Emits the packet consumed by the Journal UI.

### ATLAS — Assessment

- Scores whether a row is meaningful, duplicate, urgent, or low-signal.
- Adds assessment metadata where useful.

### ZEUS — Adversarial Review

- Checks replay, spoofing, source poisoning, missing provenance, and overconfident status.
- Blocks canon eligibility when evidence is weak.

### JADE — Canon Eligibility / Seal

- Promotes eligible HOT rows to CANON.
- Ensures Substrate writes happen only after verification.

### EVE — Synthesis

- Reads normalized summaries, not the entire raw database every time.
- Produces cycle close and weekly digest synthesis.

### AUREA / DAEDALUS — System Improvement

- Convert recurring Journal flow failures into PRs.
- Track architecture drift and implementation gaps.

---

## Journal Packet Contract

Agents and routers should converge on this shape.

```ts
type JournalPacket = {
  idempotencyKey: string;
  cycle: string;
  agent: string;
  timestamp: string;
  scope: 'journal' | 'epicon' | 'ledger' | 'dataflow';
  category: 'observation' | 'inference' | 'alert' | 'recommendation' | 'close';
  severity: 'nominal' | 'elevated' | 'critical';
  observation: string;
  inference: string;
  recommendation: string;
  confidence: number;
  derivedFrom: string[];
  sourceMode: 'hot' | 'canon' | 'derived';
  canonIntent: 'none' | 'candidate' | 'required';
  verification: {
    atlas?: 'unread' | 'assessed' | 'low_signal' | 'urgent';
    zeus?: 'pending' | 'passed' | 'blocked';
    jade?: 'pending' | 'eligible' | 'sealed';
  };
};
```

---

## Canon Promotion Gates

A HOT row can become CANON only when it passes these gates:

```txt
1. Has idempotency key.
2. Has cycle.
3. Has agent origin.
4. Has observation + inference + recommendation.
5. Has derivedFrom / provenance.
6. Is not duplicate.
7. Is not stale.
8. ZEUS does not flag it.
9. JADE approves canon eligibility.
```

If eligible:

```txt
HOT → CANON
```

If not eligible:

```txt
HOT → MERGED preview only
```

---

## Backpressure Rules

Agents should write less and summarize more.

Suggested per-agent per-cycle write budget:

```txt
5 nominal observations
3 elevated observations
unlimited critical, but ZEUS verifies after threshold
1 cycle close summary
```

Duplicate rows should be counted as evidence, not rendered endlessly.

Example:

```txt
15 duplicate KV heartbeat rows
→ 1 summarized journal row
→ duplicate_count: 15
→ evidence: [ids...]
```

---

## Journal Diagnostics

The Journal chamber should expose dataflow counts so operators know whether data is missing or filtered.

Example:

```txt
HOT: 24 rows
CANON: 6 rows
MERGED: 30 rows
Visible: 8
Hidden by tier filter: 16
Canon candidates: 5
Canon blocked: 2
Duplicates skipped: 12
```

Recommended packet metadata:

```ts
type JournalPacketMeta = {
  cycle: string;
  readMode: 'hot' | 'canon' | 'merged';
  sources: {
    hot: number;
    canon: number;
    derived: number;
    merged: number;
  };
  visibility: {
    visible: number;
    hiddenByTier: number;
    hiddenByAgent: number;
    hiddenByCycle: number;
  };
  canon: {
    candidates: number;
    blocked: number;
    sealed: number;
  };
  dedupe: {
    duplicatesSkipped: number;
    groups: number;
  };
  freshness: {
    hotUpdatedAt?: string;
    canonUpdatedAt?: string;
    packetUpdatedAt: string;
  };
};
```

---

## Proposed Endpoint

Future runtime endpoint:

```txt
/api/chambers/journal-packet
```

Purpose:

- read HOT / CANON / DERIVED context
- normalize into JournalPacket rows
- compute diagnostics
- apply filters
- return packet-ready rows

The UI should eventually consume the packet endpoint instead of reasoning directly across raw HOT/CANON/MERGED states.

---

## UI Changes

Journal UI should show:

- HOT / CANON / MERGED counts
- Visible count
- Hidden-by-filter count
- Canon candidate count
- Canon blocked count
- Duplicate skipped count
- Freshness per source

Default view should favor:

```txt
Current cycle + visible packet rows + filter explanation
```

Raw rows should remain available in Operator Mode.

---

## Acceptance Criteria

- [ ] Define Journal Packet schema.
- [ ] Define Journal Packet metadata.
- [ ] Add HERMES router normalization rules.
- [ ] Add canon promotion gate checklist.
- [ ] Add dedupe/backpressure rules.
- [ ] Add source/visibility counters to Journal response.
- [ ] Add hidden-by-filter UI summary.
- [ ] Add canon candidate / blocked diagnostics.
- [ ] Add future `/api/chambers/journal-packet` endpoint.
- [ ] Keep HOT fast and CANON earned.

---

## Non-Goals

- [ ] Do not make every HOT row canonical.
- [ ] Do not make EVE read the entire raw database every time.
- [ ] Do not let UI decide canon eligibility.
- [ ] Do not let agents bypass ZEUS/JADE gates for canon.
- [ ] Do not hide low GI or missing verification.

---

## Canon

Agents write observations.
HERMES routes packets.
ATLAS assesses signal.
ZEUS challenges trust.
JADE seals canon.
EVE synthesizes meaning.

HOT is fast.
CANON is earned.
MERGED is the operator view.

We heal as we walk.
