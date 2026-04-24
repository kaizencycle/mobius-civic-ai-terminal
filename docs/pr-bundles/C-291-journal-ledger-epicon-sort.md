# C-291 — Journal Sorting + Ledger EPICON Bridge

## Purpose

Improve the Terminal operations lanes so Journal and Ledger reflect the live system more clearly.

## Problem

The Journal lane can become noisy when entries are sorted mostly by recency. Operators need the current cycle, canon state, verification status, agent role, severity, confidence, and timestamp to drive ordering.

The Ledger chamber was reading only from ECHO in-memory ledger state. On Vercel serverless, that memory can be empty after a cold start, even while the EPICON feed is alive. This made Ledger look empty while `/api/epicon/feed` had valid entries.

## Runtime change in this PR

- `app/api/chambers/ledger/route.ts` now hydrates from both ECHO memory and `/api/epicon/feed`.
- EPICON feed items are mapped into `LedgerEntry` rows.
- The route merges, dedupes, sorts newest-first, and exposes source diagnostics.
- The route returns `Cache-Control: no-store`.

## Ledger source diagnostics

The Ledger chamber now returns:

```json
{
  "sources": {
    "echoMemory": 0,
    "epiconFeed": 42,
    "merged": 42
  }
}
```

This makes it clear whether Ledger is empty because there are no events, or because one source lane is empty.

## Journal sorting policy

The desired Journal lane ordering is:

1. Current cycle first
2. Newer cycle numbers before older cycle numbers
3. Canon state: CANON WRITTEN, CANON PENDING, HOT ONLY, CANON FAILED
4. Journal status: verified, committed, contested, draft
5. Agent lane priority: ZEUS, ATLAS, JADE, EVE, AUREA, HERMES, DAEDALUS, ECHO
6. Severity: critical, elevated, nominal
7. Confidence
8. Timestamp newest-first

The current Journal page already uses an operator-first sorter for cycle, status, severity, confidence, and recency. The next runtime patch should extend that sorter with canon state and agent lane priority once the UI type surface for `storage.canonStatus` is finalized.

## Acceptance criteria

- [x] Ledger chamber no longer depends only on warm ECHO memory.
- [x] Ledger chamber can display EPICON entries when ECHO memory is empty.
- [x] Ledger response includes source counts.
- [x] Ledger response is no-store.
- [ ] Follow-up: add canon-aware Journal sorting in the UI.
- [ ] Follow-up: expose Journal sorting mode in the UI.
