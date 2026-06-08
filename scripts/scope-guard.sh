#!/usr/bin/env bash
# scripts/scope-guard.sh — C-336 agent-DevOps guardrail.
#
# Machine-enforces what PULL_REQUEST_TEMPLATE.md asks authors to self-declare:
#   - Tier-3 paths (auth / identity / lib/substrate / MIC ledger math / the
#     guardrails themselves / deploy+infra config) are OPERATOR-ONLY. Agents
#     may PROPOSE, never SHIP. A Tier-3 edit by a non-owner FAILS.
#   - Agent-authored code changes MUST carry an EPICON receipt (epicon_id +
#     a rollback plan) in the PR body — mirrors template sections 3 and 7.
#   - Optional STRICT_ALLOWLIST: agent diffs must stay inside agent-paths.txt.
#
# Tiers mirror PULL_REQUEST_TEMPLATE.md:
#   T0 docs/comments · T1 app logic · T2 KV/journal/EPICON shape · T3 economy/identity/auth/infra
#
# exit 0 = PASS · exit 1 = FAIL (block merge). anti-nuke handles deletions; this is edits+authorship.
#
# SECURITY POSTURE: this gate fails CLOSED. If the diff can't be proven (bad
# refs, shallow history), we BLOCK rather than silently pass — the inverse of
# ignore-build.sh's fail-OPEN, because there an uncomputable diff risks losing
# a deploy, while here it risks waving through an unauthorized edit.
set -euo pipefail

CONFIG_DIR="${SCOPE_GUARD_DIR:-.github/scope-guard}"
PROTECTED_FILE="$CONFIG_DIR/protected-paths.txt"     # Tier-3, operator-only
AGENT_PATHS_FILE="$CONFIG_DIR/agent-paths.txt"
AGENT_LOGINS_FILE="$CONFIG_DIR/agent-logins.txt"

ACTOR="${ACTOR:-}"                       # PR author login
OWNER_LOGINS="${OWNER_LOGINS:-kaizencycle}"
PR_BODY_FILE="${PR_BODY_FILE:-}"
STRICT_ALLOWLIST="${STRICT_ALLOWLIST:-false}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/stderr}"
OUT="${GITHUB_OUTPUT:-/dev/null}"

# ── changed files: prove the diff or fail closed ────────────────────────────
if [[ -n "${BASE_SHA:-}" && -n "${HEAD_SHA:-}" ]]; then
  RANGE="${BASE_SHA}...${HEAD_SHA}"
else
  RANGE="${BASE_REF:-origin/main}...${HEAD_REF:-HEAD}"
fi

diff_ok=false
changed="$(git diff --name-only "$RANGE" 2>/dev/null)" && diff_ok=true || true

if [[ "$diff_ok" != true ]]; then
  {
    echo "### scope-guard — FAIL (diff unavailable)"
    echo ""
    echo "Could not resolve \`git diff --name-only $RANGE\`."
    echo "Failing CLOSED: a scope gate must never silently pass on uncertainty."
    echo "Likely cause: shallow checkout — ensure \`fetch-depth: 0\`."
  } >> "$SUMMARY"
  echo "scope-guard FAIL: could not compute diff for '$RANGE' — failing closed."
  exit 1
fi

load() { grep -vE '^[[:space:]]*(#|$)' "$1" 2>/dev/null || true; }

# ── pattern sets ────────────────────────────────────────────────────────────
mapfile -t T3 < <(load "$PROTECTED_FILE")
# Tier-2 = schema / shape / domain zones PULL_REQUEST_TEMPLATE.md's "LOCKED
# BEHAVIOR AUDIT" calls out by name (journal KV key schema, ECHO->epicon:feed
# LPUSH, EPICON shape).
T2=( '^app/api/agents/journal/route\.ts$' '^app/api/echo/ingest/route\.ts$' '^lib/epicon/' )

matches_any() { local f="$1"; shift; local p; for p in "$@"; do [[ "$f" =~ $p ]] && return 0; done; return 1; }

t3_hits=(); t2_hits=(); code_changed=false
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if matches_any "$f" "${T3[@]}"; then t3_hits+=("$f"); fi
  if matches_any "$f" "${T2[@]}"; then t2_hits+=("$f"); fi
  if [[ ! "$f" =~ ^(docs/|content/)|\.md$ ]]; then code_changed=true; fi
done <<< "$changed"

# ── tier ────────────────────────────────────────────────────────────────────
if   [[ ${#t3_hits[@]} -gt 0 ]]; then tier="T3"
elif [[ ${#t2_hits[@]} -gt 0 ]]; then tier="T2"
elif [[ "$code_changed" == true ]]; then tier="T1"
else tier="T0"; fi
echo "tier=$tier" >> "$OUT"

# ── actor class (owner wins over agent) ─────────────────────────────────────
is_owner=false
for o in $OWNER_LOGINS; do [[ "${ACTOR,,}" == "${o,,}" ]] && is_owner=true; done
is_agent=false
if [[ "$is_owner" != true ]]; then
  [[ "${ACTOR,,}" == *"[bot]" ]] && is_agent=true
  while IFS= read -r a; do [[ -n "$a" && "${ACTOR,,}" == "${a,,}" ]] && is_agent=true; done < <(load "$AGENT_LOGINS_FILE")
fi
actor_class="external"; [[ "$is_owner" == true ]] && actor_class="owner"; [[ "$is_agent" == true ]] && actor_class="agent"

# ── EPICON receipt: a ledgered `epicon_id:` + a FILLED-IN rollback plan ─────
# PULL_REQUEST_TEMPLATE.md instructs "Replace all `[PLACEHOLDERS]`" — its own
# unfilled §3/§7 carry `epicon_id: EPICON_C-[CYCLE]_...` and `git revert
# [commit-sha]`, while "Rollback Plan" / "Rollback plan provided" appear in
# the template's heading and stop-conditions checklist regardless of whether
# anything was filled in. A bare substring match on "epicon_id:" / "rollback"
# is therefore satisfied by a verbatim, untouched template. Require the
# epicon_id line — and EITHER a `rollback:` key (the compact receipt shape)
# OR a filled-in `git revert <sha>` (the template's own §7 shape) — to carry
# real values, not `[bracket]` placeholders.
have_receipt=false
if [[ -n "$PR_BODY_FILE" && -f "$PR_BODY_FILE" ]]; then
  epicon_line="$(grep -iE 'epicon_id[[:space:]]*:' "$PR_BODY_FILE" | head -1 || true)"
  rollback_kv="$(grep -iE 'rollback[[:space:]]*:' "$PR_BODY_FILE" | head -1 || true)"
  rollback_cmd="$(grep -iE 'git revert' "$PR_BODY_FILE" | head -1 || true)"

  have_epicon=false
  [[ -n "$epicon_line" && "$epicon_line" != *'['*']'* ]] && have_epicon=true

  have_rollback=false
  [[ -n "$rollback_kv"  && "$rollback_kv"  != *'['*']'* ]] && have_rollback=true
  [[ -n "$rollback_cmd" && "$rollback_cmd" != *'['*']'* ]] && have_rollback=true

  [[ "$have_epicon" == true && "$have_rollback" == true ]] && have_receipt=true
fi

# ── decision ─────────────────────────────────────────────────────────────────
fail=false; reasons=()

# Rule 1 — Tier-3 is operator-only. Agents propose, never ship into these paths.
if [[ ${#t3_hits[@]} -gt 0 && "$is_owner" != true ]]; then
  fail=true
  reasons+=("Tier-3 violation: operator-only path(s) edited by '${ACTOR:-unknown}' ($actor_class). Agents may not modify: ${t3_hits[*]}")
fi

# Rule 2 — agent code changes require an EPICON receipt (intent ledgered before diff).
if [[ "$is_agent" == true && "$code_changed" == true && "$have_receipt" != true ]]; then
  fail=true
  reasons+=("Missing EPICON receipt: agent-authored code change needs 'epicon_id:' + a rollback plan in the PR body.")
fi

# Rule 3 — optional strict allowlist for agents (off by default; flip once agent-paths.txt is trusted).
if [[ "$STRICT_ALLOWLIST" == "true" && "$is_agent" == true ]]; then
  mapfile -t AGP < <(load "$AGENT_PATHS_FILE")
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ "$f" =~ ^(docs/|content/)|\.md$ ]]; then continue; fi
    if ! matches_any "$f" "${AGP[@]}"; then
      fail=true; reasons+=("Strict allowlist: agent may not edit '$f' (outside agent-paths).")
    fi
  done <<< "$changed"
fi

# ── report ───────────────────────────────────────────────────────────────────
{
  echo "### scope-guard — $tier (author: ${ACTOR:-?} / $actor_class)"
  echo ""
  echo "Changed files: $(printf '%s\n' "$changed" | grep -c . || true)"
  [[ ${#t3_hits[@]} -gt 0 ]] && echo "- Tier-3 paths: \`${t3_hits[*]}\`"
  [[ ${#t2_hits[@]} -gt 0 ]] && echo "- Tier-2 paths: \`${t2_hits[*]}\`"
  echo "- EPICON receipt present: $have_receipt"
  if [[ "$tier" == "T2" || "$tier" == "T3" ]]; then
    echo "- ⚠️ Tier 2+ — operator review required, do not self-merge."
  fi
} >> "$SUMMARY"

if [[ "$fail" == true ]]; then
  { echo ""; echo "**FAIL**"; for r in "${reasons[@]}"; do echo "- $r"; done; } >> "$SUMMARY"
  echo "scope-guard FAIL ($tier):"; printf '  - %s\n' "${reasons[@]}"
  exit 1
fi

echo "scope-guard PASS ($tier, $actor_class)"
exit 0
