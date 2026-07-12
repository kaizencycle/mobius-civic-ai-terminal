# Operator Action — C-370 Item 5: Reserve Block `.dat` Backlog Export

**Why you're doing this:** The export infrastructure already exists (merged in PR #591 —
"C-368 PR7 reserve canon export + continuous append lane"). It has never been run against
the backlog. `canon/reserve-blocks/` on **Mobius-Substrate** is empty (`.gitkeep` only)
despite 349+ sealed Reserve Blocks attested in hot KV. This is not a code problem — it's
a one-time execution problem.

**Workflow:** [Reserve Block Canon Export](https://github.com/kaizencycle/mobius-civic-ai-terminal/actions/workflows/reserve-block-canon-export.yml)  
**Script:** `scripts/canonize-reserve-blocks.ts`  
**Authority:** `EPICON_C-368_SPECS_reserve-canon-prime_v1`

---

## Step 1 — Configure GitHub Actions secrets

In `kaizencycle/mobius-civic-ai-terminal` → **Settings → Secrets and variables → Actions**,
confirm (or add) these repo secrets:

| Secret | Required | What it is |
|---|---|---|
| `KV_REST_API_URL` | Yes | Upstash/Vercel KV REST endpoint (same as production) |
| `KV_REST_API_TOKEN` | Yes | Token for that KV instance |
| `SUBSTRATE_GITHUB_TOKEN` | Yes (if opening Substrate PR) | PAT with `contents` + `pull_requests` on `Mobius-Substrate`; same token `lib/substrate/github-reader.ts` reads |

**Optional secrets** (workflow uses defaults or skips when unset):

| Secret | Purpose |
|---|---|
| `AGENT_SERVICE_TOKEN` | API fallback if KV read fails |
| `TERMINAL_API_BASE` | Default `https://mobius-civic-ai-terminal.vercel.app` |
| `CPC_BASE_URL` | Workflow passes `--skip-cpc` by default; only needed if you remove that flag |

If any secret exists under a different name, check `.github/workflows/reserve-block-canon-export.yml`
and `scripts/canonize-reserve-blocks.ts` — match names to what the workflow actually reads.

---

## Step 2 — Run the workflow with the backlog flag

### Option A — GitHub UI (recommended)

1. Open [Reserve Block Canon Export](https://github.com/kaizencycle/mobius-civic-ai-terminal/actions/workflows/reserve-block-canon-export.yml)
2. Click **Run workflow** → branch `main`
3. Set inputs:

| Input | Value |
|---|---|
| `incremental` | **`false`** (full prime / backlog export) |
| `dry_run` | `false` (use `true` first if you want a no-write rehearsal) |
| `open_substrate_pr` | `true` |

4. Run. Expect **up to 30 minutes** (workflow timeout). The job exports locally, verifies the hash chain, then opens a **draft PR on `kaizencycle/Mobius-Substrate`**.

### Option B — GitHub CLI

```bash
gh workflow run reserve-block-canon-export.yml \
  --repo kaizencycle/mobius-civic-ai-terminal \
  --ref main \
  -f incremental=false \
  -f dry_run=false \
  -f open_substrate_pr=true
```

`incremental: false` processes the full backlog of attested-but-uncanonized blocks rather
than appending only new ones. The workflow writes MOBIUS01 hash-chained `.dat` files for
every block sitting in hot KV since C-357.

---

## Step 3 — Verify

After the workflow run:

1. **Actions run** — job `export-and-pr` green; step summary shows `total_blocks` from `MANIFEST.json`.
2. **Artifact** — `reserve-blocks-canon` uploaded (30-day retention) as a backup.
3. **Substrate draft PR** — look for `canon(C-368): prime reserve blocks cold canon (349 blocks)` on [Mobius-Substrate PRs](https://github.com/kaizencycle/Mobius-Substrate/pulls). Branch: `canon/reserve-blocks-prime-c368`.
4. **Merge the Substrate PR** — cold canon lives on Substrate `main` at `canon/reserve-blocks/`, not in the terminal repo.
5. **Count check** — confirm `canon/reserve-blocks/` has ~349+ `.dat` files plus `MANIFEST.json` (not zero / `.gitkeep` only).
6. **Gap check** — `GET https://mobius-civic-ai-terminal.vercel.app/api/vault/status` sealed count should align with `MANIFEST.json` `total_blocks` after merge.

Spot-check a few `.dat` filenames against the hot-KV attestation list to make sure counts line up.

This unblocks **item 6** (scheduled hot-KV-vs-`.dat`-count integrity check), which currently
has nothing to compare against.

---

## Step 4 — After this lands

Going forward, `/api/cron/reserve-canon-append` (Vercel cron at 00:30 UTC, from PR #591)
should detect hot/cold gap and dispatch incremental exports automatically. This manual
backlog run should be a **one-time prime** — not something repeated each cycle.

If you need to run a full prime manually again later, that signals the cron isn't firing
or the Substrate PR lane is stuck — investigate separately.

### Optional: trigger via cron endpoint

With `CRON_SECRET` and `SUBSTRATE_GITHUB_TOKEN` on Vercel:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://mobius-civic-ai-terminal.vercel.app/api/cron/reserve-canon-append?force=true"
```

Note: the cron path chooses `incremental: true` when a cold manifest already exists; for
the **initial** backlog use the workflow with `incremental: false` as above.

---

*Prepared for Michael as C-370 operator action item 5. Not an EPICON entry — config/ops
task, not a code change, per AUREA handoff ([PR #598](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/598)).*
