# C-291 — Final Proof-of-Integrity Close

## Purpose

Close C-291 with a final proof-state hardening pass for the Terminal Ledger and a JADE synthesis of the cycle.

C-291 established that Mobius is not suffering from data scarcity. The mesh is collecting enough data. The remaining issue is proof-state clarity: operators need to know whether a row is hot, candidate, attested, sealed, or blocked — and why.

Core principle:

> Low honest GI is better than fake high GI.

---

## Scan Findings

### 1. Ledger rows were visible but under-explained

The Ledger chamber showed active PR/merge rows, but many rows appeared as `pending` without an explanation.

Fix direction:

- add `statusReason`
- add `proofSource`
- add `canonState`
- expose canon counters in the Ledger chamber

### 2. Flow panel correctly isolated the weak link

The Dataflow Command surface showed:

```txt
Sources   fresh
Intake    fresh
Normalize ok
Verify    ok
Ledger    degraded
UI        fresh
```

Diagnosis:

- data is entering
- the UI is fresh
- the unresolved layer is proof/canon promotion

### 3. Journal needs HERMES packet routing next

HOT / CANON / MERGED are now conceptually clear, but the Journal still needs a runtime packet layer to explain source counts, hidden filters, canon candidates, and duplicates skipped.

### 4. Public API safety must stay attached to proof-state work

Any public data endpoint that summarizes integrity should distinguish public-safe state from operator-only diagnostics.

### 5. GI is behaving honestly

The Terminal showing degraded GI during unresolved canon proof is correct. The system should not raise GI while proof-state ambiguity remains.

---

## Runtime Fixes Included

### Ledger proof metadata

`LedgerEntry` now supports:

```ts
statusReason?: string;
proofSource?: string;
canonState?: 'hot' | 'candidate' | 'attested' | 'sealed' | 'blocked';
```

### Ledger API proof-state normalization

`/api/chambers/ledger` now assigns proof-state metadata:

```txt
pending   → awaiting_merge_or_verification_evidence / hot
committed → explicit_merge_event / candidate
committed → explicit_verification_signal / attested
reverted  → contested_or_reverted_signal / blocked
```

### Ledger chamber canon counters

The Ledger payload can now include:

```txt
hot
candidate
attested
sealed
blocked
```

### Ledger UI proof labels

The mobile Ledger view now displays:

- status
- canon state
- status reason
- proof source
- aggregate proof/canon counters

---

## 10 Optimizations Completed / Captured

1. **Proof-state metadata** — Ledger rows now have `statusReason`, `proofSource`, and `canonState`.
2. **Merge-specific status inference** — explicit PR merge evidence is treated differently from generic GitHub/feed status.
3. **Verified-signal promotion** — verified or ZEUS-style verification signals become attested, not merely hot.
4. **Blocked canon state** — contested/reverted/failed rows are labeled as blocked.
5. **Echo memory annotation** — pre-existing Echo rows receive safe fallback proof metadata.
6. **Canon counters** — Ledger responses expose hot/candidate/attested/sealed/blocked counts.
7. **Preview proof labels** — fallback/preview rows are explicitly marked as snapshot/digest pending verification.
8. **Ledger mobile clarity** — mobile cards show canon badge + proof reason to reduce operator ambiguity.
9. **Dataflow diagnosis retained** — Ledger degraded state remains honest when proof layer is unresolved.
10. **C-291 JADE synthesis** — added cycle close synthesis to preserve the proof-of-integrity lesson.

---

## Follow-Up Queue

- [ ] Implement `/api/chambers/journal-packet` for HERMES normalized Journal packets.
- [ ] Add source/visibility counters to Journal UI.
- [ ] Add ZEUS route inventory scanner for ESI.
- [ ] Add public/operator mode split for proof-state diagnostics.
- [ ] Add Civic Core tests for `/mesh/ingest`, EPICON feed shape, idempotency, and hash continuity.
- [ ] Add manifest validator for `mobius.yaml` across mesh repos.
- [ ] Add canonical `node-aliases.json` for Terminal/Substrate/Browser Shell identity drift.
- [ ] Add virtualized Ledger/Journal long lists.
- [ ] Add JADE seal state once Substrate/Civic Core attestation is present.
- [ ] Add Year-One Cycle Corpus export format.

---

## C-291 Close Diagnosis

C-291 proved the Terminal can see its own circulation.

The system can now distinguish:

```txt
Data is missing
vs.
Data is hidden by filters
vs.
Data is hot but unsealed
vs.
Data is verified but not yet canon
vs.
Data is canon-ready
```

That is Proof-of-Integrity becoming visible.

---

## Canon

Proof-of-Integrity is not a claim that the system is perfect.

It is proof that the system can see uncertainty, name degradation, preserve evidence, route corrections, and refuse false confidence.

HOT is fast.
CANON is earned.
MERGED is the operator view.
GI is not a vanity score.
Low honest GI is better than fake high GI.

We heal as we walk.
