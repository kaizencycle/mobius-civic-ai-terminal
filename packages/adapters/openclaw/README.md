# OpenClaw Adapter

## Purpose

The OpenClaw adapter allows Mobius to ingest signals from OpenClaw-based agent systems as **unverified external inputs**.

OpenClaw outputs are treated as:

- agent task results
- agent-generated reports
- tool-use traces
- structured or semi-structured reasoning artifacts

They are **not** treated as trusted truth by default.

---

## Core Rule

> OpenClaw may generate signals.  
> Only Mobius may graduate signals into trusted history.

---

## What this adapter should do

- ingest OpenClaw outputs
- normalize them into `ExternalSignal`
- convert eligible items into `NormalizedEpiconCandidate`
- preserve source metadata
- mark all signals as unverified by default

---

## Expected input examples

Examples of OpenClaw-originating signals:

- agent task completion logs
- research summaries
- tool execution outcomes
- structured analysis objects
- multi-agent conversation snapshots

---

## Normalization goals

Every ingested OpenClaw signal should preserve:

- `source_system = "openclaw"`
- `source_actor` if available
- timestamp of observation
- raw payload
- source URL or source reference if available

Then map into a Mobius-compatible EPICON candidate.

---

## Trust boundary

This adapter must **not**:

- publish verified EPICONs directly
- bypass ZEUS
- mutate MII
- write final truth-state into the ledger
- trigger privileged system actions automatically

---

## Suggested mapping

### ExternalSignal
- `source_system`: `"openclaw"`
- `category`: derived from task or agent context
- `title`: short task/result title
- `summary`: concise result summary
- `raw_payload`: original OpenClaw object

### NormalizedEpiconCandidate
- `status`: `pending`
- `confidence_tier`: `0` or `1`
- `owner_agent`: `ECHO`

---

## Promotion logic

OpenClaw output should only be promoted to EPICON candidate when:

- it has civic or operational relevance
- it is not purely internal agent chatter
- it can be meaningfully categorized
- it is useful for later ZEUS verification

---

## Future implementation ideas

- task result adapter
- multi-agent conversation adapter
- tool execution outcome adapter
- anomaly event adapter

---

## Mobius compatibility note

This adapter is compatible with Mobius only if it preserves:

- EPICON shape
- verification boundaries
- ledger continuity
- source transparency
