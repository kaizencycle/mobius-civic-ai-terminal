# Mobius Slack Agent v1

**Purpose:** Turn Slack into a **safe command surface** for Mobius.

```
Slack → command → Mobius agent wrapper → manifest validation
  → allowed endpoint / workflow / PR → OAA log → optional ledger proof → Slack reply
```

## Core rule

- **Slack** is the interface.
- **Mobius** is the constitution.
- **Agents** are executors, not rulers.

## Operating model

**Slack asks. Manifest permits. Mobius acts. OAA remembers. Ledger proves.**

## v1 scope

### Allowed in v1

- Read system state
- Read cycle state
- Read vault / MIC readiness
- Read pulse / integrity snapshot
- Append memory notes (OAA)
- Open draft PRs (when `GITHUB_TOKEN` + repo resolution are configured — otherwise explicit operator-truth error)
- Trigger safe workflows (`workflow_dispatch` for ids in manifest **and** declared in `mobius.yaml` `jobs.workflows`)
- Propose HIVE world updates (logged as structured proposal to OAA)

### Not allowed in v1

- Auto-merge PRs
- Direct writes to protected truth files
- Direct MIC minting
- Direct ledger rewrites
- Unrestricted multi-repo code edits
- Privileged destructive actions from Slack

## First command set

1. `@Mobius status`
2. `@Mobius vault`
3. `@Mobius cycle`
4. `@Mobius pulse`
5. `@Mobius propose <task>`

## Expanded safe set

`status` · `vault` · `cycle` · `pulse` · `readiness` · `journal` · `quest` · `propose <task>` · `draft-pr <title>` · `run <safe_workflow>`

## Command behavior (sources of truth)

| Command | Returns (summary) | Primary sources |
|--------|-------------------|-----------------|
| **status** | GI, KV, cycle, heartbeat, tripwires, GI source mode | `GET /api/terminal/snapshot-lite` |
| **vault** | Reserve / tranche / seal lane / MIC readiness hints | `GET /api/vault/status`, `GET /api/mic/readiness` |
| **cycle** | Current cycle, blockers/degraded, snapshot meta | `ledger/cycle-state.json` (repo), snapshot-lite |
| **pulse** | Mesh pulse lane, node freshness, anomalies | Snapshot-lite `lanes.pulse` + integrity |
| **readiness** | MIC readiness envelope (as returned by API) | `GET /api/mic/readiness` |
| **journal** | Short journal heartbeat + pointer to full journal API | Snapshot-lite + optional `GET /api/agents/journal` when service auth is available on the bridge host |
| **quest** | Treated as `propose` with a `[quest]` prefix for OAA |
| **propose** | OAA memory entry + Slack plan text | OAA `/api/oaa/kv` via `OAADataClient` |
| **draft-pr** | Creates branch + proposal markdown + **draft** PR (no auto-merge) | GitHub REST + `slack_agent.github` / env repo |
| **run** | `POST .../actions/workflows/{file}/dispatches` for allowlisted + YAML-declared workflows | GitHub REST + `mobius-manifest.json` + `mobius.yaml` |

## Architecture

| Layer | Role |
|-------|------|
| **A. Slack app** | Receives mentions / slash commands; POSTs signed payloads to the Terminal bridge. |
| **B. Mobius agent wrapper** | Parses command → intent class (`read_only` / `write_candidate` / `github_draft_only`). |
| **C. `mobius-manifest.json`** | Policy engine: enabled flag, allowed commands/workflows, write policy. |
| **D. Execution targets** | Terminal HTTP routes, `ledger/cycle-state.json`, OAA KV journal, (optional) GitHub API. |
| **E. Logging** | Every command: OAA audit entry `{ source, actor, command, cycle, intent }`. Meaningful actions: optional ledger proof via existing ingest path when configured. |

## Permission classes

1. **Read** — `status`, `vault`, `pulse`, `cycle`, `readiness`, `journal`
2. **Propose** — `propose`, `quest` (maps to propose)
3. **Trigger** — `run` (allowlisted workflows only; must match `mobius.yaml` declarations when that section is non-empty)
4. **Protected** — Blocked in v1: merge, manifest edit, MIC mint, ledger rewrite, destructive ops

## Slack channel map (organizational)

| Channel | Use |
|---------|-----|
| `#mobius-control-room` | status, pulse, cycle, vault |
| `#hive-world` | quests, events, sentinel dialogue, world proposals |
| `#mobius-build` | draft PRs, workflow runs, repo proposals |

Optional enforcement: set `slack_agent.allowed_channel_ids` in `mobius-manifest.json` to non-empty to restrict which Slack channel IDs the bridge accepts (Slack channel IDs look like `C0123456789`).

**GitHub (draft PR + workflow dispatch):** set `slack_agent.github.repo` to `owner/repo` (or `SLACK_AGENT_GITHUB_REPO` / `GITHUB_REPOSITORY` in Actions). Set `GITHUB_TOKEN` with `contents`, `pull_requests`, and `actions:write` for this repository. Event dedupe uses **KV** (`KV_REST_*` or `UPSTASH_REDIS_*`) when configured; otherwise a single-instance in-memory set (Slack retries only dedupe on that instance).

## HTTP bridge (this repo)

- **Route:** `POST /api/slack/agent`
- **Verification:** Slack signing secret (`SLACK_SIGNING_SECRET`). Handles `url_verification` challenges.
- **Auth:** Requests must include valid `X-Slack-Signature` + `X-Slack-Request-Timestamp` (Slack Events API).
- **Replies:** Slack’s Events API expects a quick `200` ack; the bridge posts the operator response with `chat.postMessage` using `SLACK_BOT_TOKEN` (`xoxb-…`, `chat:write`).

## Guardrails

**Hard:** No auto-merge, no main writes, no destructive commands, no mint authorization, no direct truth overwrite.

**Soft:** OAA audit on every command when OAA client is configured; optional ledger proof for meaningful writes when ingest is configured; workflow allowlist only.

## Related files

- `mobius-manifest.json` — policy
- `lib/slack-agent/*` — parser, manifest load, command router
- `app/api/slack/agent/route.ts` — Slack Events entrypoint
