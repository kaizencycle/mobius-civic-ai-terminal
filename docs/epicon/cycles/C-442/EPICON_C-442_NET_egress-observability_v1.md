# EPICON_C-442_NET_egress-observability_v1

**Cycle:** C-442
**Scope:** core
**Status:** published — non-executable intent
**Authority:** observability instrumentation only; `execution_authorized: false`

---

```intent
epicon_id: EPICON_C-442_NET_egress-observability_v1
ledger_id: kaizencycle
scope: core
mode: normal
issued_at: 2026-09-22T00:00:00Z
expires_at: 2026-12-21T00:00:00Z

justification:
  VALUES INVOKED: Operator truth over illusion; capability is not authority; observation before enforcement.
  REASONING: Vercel production logs showed this process making outbound
    calls (api.gdeltproject.org timeout, a ledger POST carrying
    hasAgentToken=true) with no way to answer who requested it, why, or
    whether the destination was expected. The HERMES discovery pass in
    this PR found roughly 60 distinct network-capable code paths across
    the codebase -- touching each call site individually would be the
    giant multi-feature rewrite AGENTS.md warns against, so this PR
    instruments the single choke point that every outbound call already
    passes through, namely globalThis.fetch, wrapped once at server
    startup via Next 15's stable instrumentation.ts hook. The wrapper is
    a pure passthrough and delegates to the original fetch unmodified,
    only recording a receipt on the way. Attribution via actor and
    trigger is honest rather than guessed, so most receipts report actor
    SYSTEM and trigger unknown, because most call sites are not wrapped
    with the new withEgressContext helper. The one genuinely
    AGENT_SELECTED path in the codebase, the URL-fetching
    crawler/integrity-scan route where an agent supplies the destination
    at runtime, is wired with real attribution as a worked example.
    ZEUS's authority matrix classifies every known destination found by
    HERMES, and an unmatched destination defaults to expected false and
    authority UNRESOLVED, exactly as specified. No credential value is
    ever logged, only the class of credential attached, derived from
    header names.
  ANCHORS:
    - docs/architecture/network-egress-inventory-c442.md (HERMES discovery: ~60 network-capable paths, classified SYSTEM_FIXED/CRON_FIXED/USER_INITIATED/AGENT_SELECTED/UNKNOWN)
    - lib/eve/global-news.ts (fetchGDELTGlobal -- the exact call site named in the production evidence trigger)
    - app/api/epicon/feed/route.ts:382 (the hasAgentToken=true ledger-connection log line named in the evidence trigger)
    - Next.js 15 instrumentation.ts stability (no next.config.ts change needed -- next.config.ts is a scope-guard Tier-3 protected path this PR does not touch)
  BOUNDARIES: OBSERVE phase only. No request is ever blocked, denied,
    delayed, or rewritten -- the fetch wrapper always returns exactly what
    the original fetch would have returned. No new outbound capability is
    added anywhere. No KV/journal/durable persistence for NET_EGRESS
    receipts is introduced -- they land in the existing Vercel log stream
    (console.log), matching how the evidence trigger itself was found. No
    Tier-3 path (auth.ts, lib/auth/, lib/identity/, lib/substrate/,
    lib/mic/, lib/integrity/, .github/workflows/, vercel.json,
    next.config.ts, package.json) is touched. withEgressContext is wired
    into exactly one route as a demonstration, not retrofitted broadly.
    LEVEL 4 (circumvention) and LEVEL 5 (propagation) classification are
    explicitly out of scope -- both require correlating multiple receipts
    across a denial-and-retry or cross-agent handoff, which needs the
    durable storage this PR deliberately does not add yet.
  COUNTERFACTUAL: If a reviewer finds the global fetch wrapper changes
    response bytes, headers, timing-sensitive behavior, or error semantics
    for any existing call site, that falsifies the passthrough claim and
    this PR should be reverted. If the authority matrix in
    lib/net/egress-authority.ts is found to mis-list a destination's
    expected methods or credential class against what HERMES's inventory
    actually documented, fix the matrix entry, not the classifier logic.

counterfactuals:
  - If a future PR wires withEgressContext into additional routes and that changes cron/route behavior, that is an enforcement-adjacent change requiring its own EPICON, not covered by this one.
  - If NET_EGRESS log volume proves too high for the existing Vercel log retention, that argues for durable storage design as a follow-up, not for narrowing what gets observed.
  - Rollback is git revert of this PR's commits -- no KV mutation, no schema change, no migration to undo.
```

---

## Summary

Instruments Mobius Terminal so every outbound network request is recorded as a `NET_EGRESS` receipt, without changing what any request does. Three deliverables, matching the C-442 handoff:

- **HERMES** (`docs/architecture/network-egress-inventory-c442.md`): a read-only inventory of ~60 network-capable code paths, classified `SYSTEM_FIXED` / `CRON_FIXED` / `USER_INITIATED` / `AGENT_SELECTED` / `UNKNOWN`.
- **ATLAS** (`lib/net/egress.ts`, `instrumentation.ts`): the `NET_EGRESS` receipt schema and a single-choke-point `globalThis.fetch` wrapper, installed once at server startup via Next.js 15's stable `instrumentation.ts` hook. Pure passthrough — never blocks, denies, or rewrites a request.
- **ZEUS** (`lib/net/egress-authority.ts`, `lib/net/egress-anomaly.ts`): a declarative authority matrix built directly from the HERMES inventory, and a read-only classifier implementing anomaly LEVEL 0–3 (LEVEL 4/5 require cross-receipt correlation this PR does not add — see BOUNDARIES). Unmatched destinations classify `expected: false, authority: UNRESOLVED`.

`withEgressContext` (the opt-in attribution helper) is wired into exactly one route — `app/api/crawler/integrity-scan` — the single `AGENT_SELECTED` path HERMES found, where an agent supplies the fetch destination at runtime. Every other call site is observed with honest `actor: SYSTEM, trigger: unknown` defaults rather than guessed attribution.

Per the C-442 handoff's Cycle 0 Watch: no agent prompt, route, or test added by this PR directs anything toward `chambers.mobius-substrate.com`, `/llms.txt`, `/canon/cycle-0`, or `/canon/virtue-accord`.

## Rollback

```bash
git revert <commit-sha>
# No KV mutation, no schema migration, no durable state introduced by this PR.
```
