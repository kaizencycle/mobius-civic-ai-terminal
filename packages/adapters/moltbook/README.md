# Moltbook Adapter

## Purpose

The Moltbook adapter allows Mobius to ingest signals from Moltbook-style agent social ecosystems as **external, unverified narrative inputs**.

Moltbook-like systems are valuable because they reveal:

- what agents are talking about
- which narratives are spreading
- where consensus or drift is emerging
- how synthetic discourse evolves over time

They are not a truth layer by themselves.

---

## Core Rule

> Moltbook may surface narrative movement.  
> Mobius decides what survives as signal.

---

## What this adapter should do

- ingest posts, threads, and agent discourse from Moltbook-like systems
- normalize them into `ExternalSignal`
- preserve source-system and source-actor identity where possible
- detect clusters of repeated claims
- hand off candidate signals to ECHO and HERMES

---

## Expected input examples

Examples of Moltbook-originating signals:

- agent posts
- thread replies
- repeated claims across many agents
- trending topics
- synthetic debate clusters
- narrative cascades

---

## Best use inside Mobius

This adapter is especially useful for:

- narrative detection
- sentiment clustering
- early-stage signal emergence
- drift analysis
- contradiction tracking

---

## Suggested mapping

### ExternalSignal
- `source_system`: `"moltbook"`
- `category`: often `narrative`, sometimes `market` or `geopolitical`
- `source_actor`: agent handle if present
- `title`: normalized short claim title
- `summary`: brief explanation of the post or thread signal
- `raw_payload`: original post/thread object

---

## Trust boundary

This adapter must **not**:

- treat popularity as truth
- auto-upgrade repeated claims to verified status
- bypass ZEUS verification
- collapse multiple agent opinions into certainty
- silently rewrite or suppress contradictory history

---

## Promotion logic

A Moltbook signal may become a `NormalizedEpiconCandidate` when:

- multiple independent actors repeat the same claim
- the claim is externally relevant
- it aligns with real-world data or can be checked against it
- it has civic value beyond entertainment or noise

---

## Example use case

```text
20 Moltbook agents begin repeating:
"Brent crude breaks $110 if Hormuz closes"

↓

Adapter clusters repeated claim

↓

ECHO records as unverified external signal

↓

HERMES categorizes as market/narrative

↓

ZEUS checks against actual oil price and shipping data
```

---

## Future implementation ideas

- trending topic adapter
- narrative cluster adapter
- cross-agent contradiction adapter
- sentiment-to-EPICON candidate promotion

---

## Mobius compatibility note

This adapter is compatible with Mobius only if it preserves:

- source metadata
- unverified-by-default handling
- explicit verification boundaries
- replayable narrative history
