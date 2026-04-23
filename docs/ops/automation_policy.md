# Mobius Terminal — Automation Policy

**Cycle:** C-263  
**Clock-in:** March 28, 2026, 5:09 AM (America/New_York)  
**Scope:** Cursor background agents, terminal automations, heartbeat pipelines, ZEUS verification, EPICON feed operations

---

## Purpose

This policy separates **code change workflows** from **runtime signal workflows** so Mobius Terminal does not flood the repository with operational noise.

**Canonical rule:**

> **Code belongs in Git. Signals belong in KV.**

Git is for reviewable source changes.  
KV is for live agent emissions, heartbeats, verification events, and ledger-feed runtime data.

### STEP 0 — Read shared world state (C-274)

Automations that reason about live terminal state should begin from:

**GET** `https://mobius-civic-ai-terminal.vercel.app/api/terminal/snapshot`

Extract and use:

- **cycle** — current cycle ID
- **gi** — current global integrity score (from the integrity lane / composite as applicable)
- **anomalies** — active signal anomalies (where present in snapshot lanes)
- **echo** / **epicon** — latest entries this cycle (including **echo.epicon**-shaped data when exposed)
- **sentiment** — domain scores (financial, environmental, etc.)
- **substrate** — what other agents last wrote to Mobius-Substrate (`substrate.agents` with `lastEntry` / `entryCount`, plus `substrate.latest` for the same rows)

Use this as the base context for all reasoning. **Do not** separately fetch USGS, CoinGecko, EONET, or similar when the snapshot already carries a normalized view.

---

## Operating Modes

### 1. PR_MODE
Use this mode whenever the task changes source code, config, schemas, UI, routes, types, docs, or implementation logic.

**Allowed:**
- create a branch
- make code changes
- open a pull request
- produce reviewable diffs
- run verification and report results

**Not allowed:**
- using PRs as a transport for runtime heartbeat data
- creating repeated PRs for operational logs
- writing live feed noise into repo history

**Examples:**
- add a new chamber
- patch a route
- add KV integration code
- fix hydration logic
- update terminal navigation
- add types or schemas

**Default output:**
- one branch
- one PR
- one reviewable patch

---

### 2. KV_RUNTIME_MODE
Use this mode whenever the task emits live operational events.

This includes:
- heartbeat events
- ZEUS verification events
- catalog events
- EPICON feed events
- health pings
- ingest notifications
- runtime ledger writes

**Allowed:**
- POST to runtime endpoints
- write live events directly to KV
- verify feed visibility
- run one-time backfill when explicitly authorized
- inspect runtime health endpoints

**Hard rule:**
- **no git writes in runtime mode**

**Forbidden:**
- no branch creation
- no PR creation
- no draft PRs
- no background “automation PRs”
- no commits to `main`
- no storing heartbeat emissions in git history
- no silent code edits while supposed to be in runtime mode

**Examples:**
- POST `/api/runtime/heartbeat`
- POST `/api/zeus/verify`
- POST `/api/epicon/create`
- check `/api/epicon/feed`
- verify `/api/kv/health`

**Default output:**
- runtime signal written to KV
- feed updated
- zero repo activity

---

### 3. DIRECT_MAIN_MODE
Use this only when explicitly authorized by the operator.

This mode is reserved for low-risk, intentional, direct updates where PR overhead is unnecessary.

**Allowed only when explicitly requested:**
- direct push to `main`
- update stable, approved files
- apply a tightly scoped patch without PR ceremony

**Not allowed:**
- runtime event logging
- frequent automation pushes
- noisy commit loops
- unreviewed architectural changes

**Use cases:**
- canonical markdown refresh
- stable docs update
- approved low-risk cleanup

**If branch protection blocks the push:**
- stop
- report the block
- switch to PR_MODE

---

## Dispatcher Logic

Use this logic first before acting:

### If the task changes source code
→ **USE PR_MODE**

### If the task emits live operational events
→ **USE KV_RUNTIME_MODE**

### If the task updates approved low-risk static artifacts and direct push is explicitly allowed
→ **USE DIRECT_MAIN_MODE**

**Never mix these modes.**

---

## Mode Selection Table

| Task Type | Correct Mode | Git Activity | KV Activity |
|---|---|---:|---:|
| Add a new route | PR_MODE | Yes | No |
| Patch heartbeat logic | PR_MODE | Yes | No |
| Emit a heartbeat event | KV_RUNTIME_MODE | No | Yes |
| Emit ZEUS verification event | KV_RUNTIME_MODE | No | Yes |
| Refresh EPICON runtime feed | KV_RUNTIME_MODE | No | Yes |
| One-off approved doc update | DIRECT_MAIN_MODE | Yes | No |
| Repeated automation logs | KV_RUNTIME_MODE | No | Yes |

---

## C-622 Specific Rule

For **EPICON KV write integration**:

### Stage 1 — implementation
Use **PR_MODE**.

This stage may:
- install `@vercel/kv`
- create `src/lib/epicon-writer.ts`
- patch heartbeat and ZEUS routes
- add a guarded direct write endpoint
- open one PR

### Stage 2 — runtime operation
Use **KV_RUNTIME_MODE**.

This stage may:
- call runtime endpoints
- verify KV health
- verify feed visibility
- trigger one manual heartbeat
- confirm new entries appear in the feed

This stage may **not**:
- create commits
- open PRs
- create background branches
- log runtime signals through GitHub

---

## Runtime Verification Checklist

When operating in **KV_RUNTIME_MODE**, verify in this order:

1. `GET /api/kv/health`  
2. `GET /api/epicon/feed`  
3. `GET /api/epicon/feed?type=heartbeat`  
4. `GET /api/epicon/feed?type=zeus-verify`  
5. `POST /api/runtime/heartbeat`  
6. Re-check `GET /api/epicon/feed`

### Success condition
Runtime success means:
- new items appear in the feed
- source is `kv-ledger`
- feed latency is within target
- no repo activity was created

### Failure rule
If any runtime check fails:
- stop
- report the exact failing step
- include response body
- do **not** create a code PR unless explicitly told to switch to PR_MODE

---

## Repository Hygiene Rules

To prevent deployment churn and branch spam:

- do not use PRs as a heartbeat bus
- do not use commits as a runtime event stream
- do not let background agents open recurring PRs for ephemeral system state
- do not store feed noise in commit history
- do not rebuild production because a heartbeat wants to speak

**Mobius doctrine:**
- implementation changes should trigger builds
- runtime signals should update storage, not source code

---

## Cursor Background Agent Guidance

When giving instructions to Cursor or background agents, explicitly state the mode.

### Example header
```md
## MODE
PR_MODE
```

or

```md
## MODE
KV_RUNTIME_MODE
```

or

```md
## MODE
DIRECT_MAIN_MODE
```

If no mode is declared, default to:
- **PR_MODE** for source changes
- **KV_RUNTIME_MODE** for live operations

Never infer that runtime work should create a PR.

---

## Human Override

Human operator authority is absolute.

If Michael explicitly says:
- “push directly to main” → DIRECT_MAIN_MODE may be used
- “make a PR” → PR_MODE must be used
- “just run it live” → KV_RUNTIME_MODE must be used

If the instruction is ambiguous, prefer the safer interpretation:
- code → PR_MODE
- signal → KV_RUNTIME_MODE

---

## One-Line Canon

> **Code belongs in Git. Signals belong in KV. Review belongs in PRs. Runtime belongs in the ledger.**
