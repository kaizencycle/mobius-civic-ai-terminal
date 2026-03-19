# Bots of Wall Street Adapter

## Purpose

The Bots of Wall Street adapter allows Mobius to ingest market claims from AI-finance debate environments as **raw market signal inputs**.

These systems are useful for:

- market chatter
- synthetic sentiment
- repeated valuation narratives
- prediction clustering

They are **not** treated as verified financial intelligence by default.

---

## Core Rule

> Bots of Wall Street may generate market opinions.  
> Mobius evaluates whether any of them matter.

---

## What this adapter should do

- ingest AI-generated market posts or claims
- normalize them into `ExternalSignal`
- preserve ticker, agent, and source metadata
- convert repeated or potentially useful claims into EPICON candidates
- keep all such candidates pending until ZEUS review

---

## Expected input examples

Examples of Bots of Wall Street-originating signals:

- bullish or bearish ticker posts
- valuation arguments
- momentum claims
- macro narratives tied to equities
- price predictions
- recurring thesis clusters

---

## Best use inside Mobius

This adapter is useful for:

- market narrative monitoring
- sentiment clustering
- prediction tracking
- debate-to-EPICON conversion
- source reliability scoring over time

---

## Suggested mapping

### ExternalSignal
- `source_system`: `"bots_of_wall_street"`
- `category`: usually `market`, sometimes `narrative`
- `source_actor`: bot handle or agent identity
- `title`: normalized ticker claim title
- `summary`: concise thesis summary
- `raw_payload`: original post or thread object
- `tags`: include ticker symbols where possible

### NormalizedEpiconCandidate
- `status`: `pending`
- `confidence_tier`: `0` or `1`
- `owner_agent`: `ECHO`

---

## Trust boundary

This adapter must **not**:

- equate frequency of claims with correctness
- publish verified market entries directly
- bypass ZEUS
- assign high confidence from sentiment alone
- overwrite historical misses

---

## Example use case

```text
Multiple bots repeat:
"$NVDA demand is collapsing"

↓

Adapter clusters repeated claim

↓

ECHO records pending market EPICON candidate

↓

HERMES tags semiconductors / sentiment / market

↓

ZEUS checks against earnings, guidance, and price action

↓

Outcome is later tracked as hit or miss
```

---

## Why this matters

Bots of Wall Street-like systems show what agent ecosystems think.

Mobius answers:
- which claims persist?
- which claims verify?
- which agents or ecosystems deserve weight?

This turns raw AI-finance discourse into tracked, auditable intelligence.

---

## Future implementation ideas

- ticker claim adapter
- prediction tracking adapter
- bot thesis clustering
- source reliability leaderboard

---

## Mobius compatibility note

This adapter is compatible with Mobius only if it preserves:

- market claim traceability
- pending-first status
- later ZEUS verification
- source-system accountability
