# Mobius Automation Catalog

Codex automations registered for `kaizencycle/mobius-civic-ai-terminal`.  
All automations follow the Mobius two-class taxonomy (Class A: code+git, Class B: runtime/data only).

---

## STEP 0 — Read shared context from terminal (C-274)

Before other checks, every automation should start from the normalized terminal snapshot:

**GET** `https://mobius-civic-ai-terminal.vercel.app/api/terminal/snapshot`

Extract at minimum: **GI**, **cycle**, **signals** (composite), **anomalies** (where present), **echo** / **epicon** (latest entries), **sentiment** (domains), **`substrate.latest`** (recent agent journal rows from Mobius-Substrate).

Use this as base context for all reasoning. **Do not** re-fetch USGS, CoinGecko, EONET, or similar separately when the snapshot already carries the normalized view.

---

## Active Automations

| Name | Schedule | Class | Type | Doc |
|---|---|---|---|---|
| DAEDALUS Runtime Health Sweep | Daily 06:00 UTC | B | Repo Maintenance | [DAEDALUS-SWEEP.md](./DAEDALUS-SWEEP.md) |
| DAEDALUS Fault Response — Auto-Triage & Fix Dispatch | Daily 06:30 UTC | A+B | Incidents & Triage | [DAEDALUS-TRIAGE.md](./DAEDALUS-TRIAGE.md) |

---

## Automation Taxonomy

### Class A — Code-shaping
- May read and modify source files
- May commit to `main` directly (single-file fixes only)
- May NOT open PRs
- May NOT commit to feature branches
- Commit messages must include `[auto-triage]` or `[skip ci]` as appropriate
- Maximum 3 commits per run

### Class B — Runtime/ledger/data
- Read-only HTTP checks against live endpoints
- KV reads/writes only (no git)
- No source file access
- No commits

---

## Runbook

**When SWEEP flags `ENV_MISSING`:**
→ Go to Vercel Dashboard → Settings → Environment Variables  
→ Set the flagged var for Production + Preview  
→ Redeploy from dashboard (or push a human-authored commit to trigger `ignore-build.sh` pass)

**When SWEEP flags `URL_DRIFT` or `AUTH_MISMATCH`:**
→ TRIAGE automation will auto-fix in the next run  
→ Verify fix via `/api/runtime/heartbeat` 60 min after TRIAGE runs

**When TRIAGE produces a human-action card:**
→ See the card for exact var name and Vercel dashboard path  
→ Cards are also tracked in [DAEDALUS-TRIAGE.md → Human-Action Card Registry](./DAEDALUS-TRIAGE.md#human-action-card-registry)

**When all agents show `unknown` / heartbeat stale:**
→ Root cause is always `MOBIUS_SERVICE_SECRET` not set  
→ Fix the env var, not the agent routes

---

## Adding New Automations

1. Add prompt to Codex → Automations → New
2. Create doc in `docs/automations/{NAME}.md` using existing files as template
3. Add row to the table above
4. Commit: `docs(automations): register {NAME} automation [skip ci]`
