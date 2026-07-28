# C-386 — ATLAS implementation handoff: journal ledger attest lifetime

**Status:** IMPLEMENTED (branch `cursor/c386-journal-attest-after-0e02`)  
**Risk:** LOW-MEDIUM — does not change kv-watchdog HTTP outcomes (409 collision gate unchanged)  
**Human authority:** Michael Judan

## Executive intent

Committed journal entries call `writeToSubstrate` → `getAttestBearerToken` → identity login. That work was started with bare `void` and could be cut off when the cron route returned, producing `[identity-token] login network error` without matching `[journal] ledger attest failed` logs.

**Fix:** wrap `writeToSubstrate` in `scheduleJournalLedgerAttest()` — uses Next.js `after()` inside `try/catch`, falling back to immediate execution when `after()` is unavailable (no active request scope).

**Secondary:** `loginOnce` fetch timeout 12s → 20s for Render cold-start (after lifetime is fixed first).

## Pre-flight

| Check | Result |
|-------|--------|
| `after()` stable at Next ^15.1.0 | Yes — in production routes already |
| `next.config` flag for `after()` | Not required on 15.1 |
| kv-watchdog response coupling | None — escalation awaits journal KV write, not substrate attest |

## Follow-on `void` inventory (not fixed in this patch)

| Location | Pattern |
|----------|---------|
| `lib/agents/journal.ts` | `void pushLedgerEntry(...)` (sibling, unchanged) |
| `app/api/epicon/promote/route.ts` | `void writeToSubstrate` (×2) |
| `lib/signals/runMicroSweep.ts` | `void pushLedgerEntry` |
| `lib/agents/journal.ts` | `void` journal lane cross-write IIFE, watermark bump |

## Production log triage (2026-07-28 window)

| Signal | Verdict |
|--------|---------|
| `vault-v2 deposit blocked — 125 collision` + HTTP 409 | **Expected** — seal integrity gate; Track R / collision repair still open |
| `[identity-token] login … timeout` on `/api/cron/kv-watchdog` | **Addressed by this patch** (+ timeout tune) |
| `[swarm] ATLAS credit cooldown` | Informational — Anthropic budget governor |

## ATLAS implementation report

1. **PRE-FLIGHT:** `after()` confirmed stable; no config gate.
2. **FILES:** `lib/agents/journal.ts`, `lib/substrate/identityToken.ts`, `tests/contract/journalAttestAfter.test.ts`.
3. **PATCH:** `schedulePostResponseWork` + `scheduleAppendAgentJournalEntry`; attest returns `writeToSubstrate` promise (not `void`); fire-and-forget routes (`aurea/oversee`, `cron/watchdog`, `zeus/verify`) register append via `after()` before handler return.
4. **TESTS:** Source contract asserts `after` + no bare `void writeToSubstrate`.
5. **RECOMMENDATION:** PASS pending deploy smoke (watch for `[journal] ledger attest failed` or successful attest after kv-watchdog 409 ticks).
