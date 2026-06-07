#!/usr/bin/env bash
# C-305 OPT-01 + C-314 T-01 + C-335 UNFREEZE: Vercel ignoreCommand gate.
# exit 0 = skip build, exit 1 = build.
# Prefer VERCEL_GIT_* when present (ignoreCommand runs before full clone in some paths).
#
# C-335 UNFREEZE (prod was stuck ~2 days on dpl_G6vR while ~40 sentinel pushes
# canceled behind it):
#   - Added operator FORCE-BUILD overrides, evaluated before every skip rule
#     (including [skip ci]), so a human/forced deploy can never be starved by
#     the sentinel skip-ci stream.
#   - Narrowed the GitHub-noreply bot match to real "[bot]" accounts only. The
#     plain "<user>@users.noreply.github.com" form is what a human's commit
#     looks like after merging via the GitHub UI (incl. the repo owner) — the
#     old blanket ".noreply.github.com$" pattern swallowed those merges, which
#     was a primary cause of the freeze.
#   - Content-based skips (lockfile-only / docs-only) now FAIL OPEN: if the
#     diff can't be computed (shallow clone / no history), we build rather
#     than risk a false skip.
set -euo pipefail

subject="${VERCEL_GIT_COMMIT_MESSAGE:-}"
author_email="${VERCEL_GIT_COMMIT_AUTHOR_EMAIL:-}"
author_name="${VERCEL_GIT_COMMIT_AUTHOR_NAME:-}"
author_login="${VERCEL_GIT_COMMIT_AUTHOR_LOGIN:-}"
branch="${VERCEL_GIT_COMMIT_REF:-}"

if [[ -z "$subject" ]]; then
  subject="$(git log -1 --format=%s 2>/dev/null || echo "")"
fi
if [[ -z "$author_email" ]]; then
  author_email="$(git log -1 --format=%ae 2>/dev/null || echo "")"
fi
if [[ -z "$author_name" ]]; then
  author_name="$(git log -1 --format=%an 2>/dev/null || echo "")"
fi
if [[ -z "$branch" ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
fi

el="${author_email,,}"
ll="${author_login,,}"

# Sentinel + catalog bot addresses (explicit + mobius.systems agent inboxes).
SENTINEL_EMAILS=(
  "bot@mobius.systems"
  "bot@mobius.substrate"
  "bot@mobius.internal"
  "atlas@mobius.systems"
  "zeus@mobius.systems"
  "eve@mobius.systems"
  "jade@mobius.systems"
  "aurea@mobius.systems"
  "hermes@mobius.systems"
  "echo@mobius.systems"
  "daedalus@mobius.systems"
  "cursoragent@cursor.com"
)

is_listed_sentinel=false
for em in "${SENTINEL_EMAILS[@]}"; do
  if [[ "$el" == "${em,,}" ]]; then
    is_listed_sentinel=true
    break
  fi
done

# Match mobius-bot identity (name/login) and legacy bot emails used on CI / Cursor.
# C-323 INFRA-05: VERCEL_GIT_COMMIT_AUTHOR_LOGIN check — more reliable than name/email
# for GitHub Actions bot (login = "github-actions[bot]") and mobius-bot (login = "mobius-bot").
# C-335: the noreply match is narrowed to real "[bot]" accounts only — see header note.
is_bot=false
if [[ "$ll" == "mobius-bot" ]] \
  || [[ "$ll" == "github-actions[bot]" ]] \
  || [[ "$ll" == *"[bot]" ]] \
  || [[ "$author_name" == "mobius-bot" ]] \
  || [[ "$author_name" == "github-actions[bot]" ]] \
  || [[ "$is_listed_sentinel" == true ]] \
  || [[ "$author_email" =~ ^(atlas|zeus|eve|jade|aurea|hermes|echo|daedalus)@mobius\.systems$ ]] \
  || [[ "$el" =~ @mobius\.substrate$ ]] \
  || [[ "$el" =~ ^[0-9]+\+.*\[bot\]@users\.noreply\.github\.com$ ]]; then
  is_bot=true
fi

# Operator (human owner) identity — used only by the FORCE-BUILD overrides below.
OWNER_EMAILS=( "michaeljjudan@gmail.com" "kaizencycle@users.noreply.github.com" )
OWNER_LOGINS=( "kaizencycle" )
is_owner=false
for em in "${OWNER_EMAILS[@]}"; do
  if [[ "$el" == "${em,,}" ]]; then is_owner=true; break; fi
done
for lo in "${OWNER_LOGINS[@]}"; do
  if [[ "$ll" == "${lo,,}" ]]; then is_owner=true; break; fi
done

# ════════════════════════════════════════════════════════════════════════════
# C-335 FORCE-BUILD OVERRIDES — evaluated before every skip rule below,
# including [skip ci]. Without this, a human/forced deploy can be starved
# indefinitely by the sentinel skip-ci stream — exactly what happened to
# dpl_G6vR.
# ════════════════════════════════════════════════════════════════════════════

# 1. An explicit deploy directive wins over everything, including [skip ci].
#    Refused from bot authors as a safety guard — sentinels never emit these,
#    so this only ever fires for a human/forced commit.
if [[ "$is_bot" == false ]] \
  && { [[ "$subject" == *"[deploy]"* ]] || [[ "$subject" == *"[force deploy]"* ]] || [[ "$subject" == *"[force-build]"* ]]; }; then
  echo "Building: explicit deploy directive — $subject"
  exit 1
fi

# 2. Operator-authored commits always build, unless the operator themselves
#    tagged the commit to skip.
if [[ "$is_owner" == true ]]; then
  if [[ "$subject" == *"[skip ci]"* || "$subject" == *"[skip deploy]"* ]]; then
    echo "Skipping: operator commit explicitly tagged skip — $subject"
    exit 0
  fi
  echo "Building: operator-authored commit — $subject"
  exit 1
fi

# ════════════════════════════════════════════════════════════════════════════
# SKIP RULES — automated noise suppression.
# ════════════════════════════════════════════════════════════════════════════

if [[ "$subject" == *"[skip ci]"* ]] || [[ "$subject" == *"[skip deploy]"* ]]; then
  echo "Skipping: skip directive in commit message"
  exit 0
fi

if [[ "$is_bot" == true ]]; then
  echo "Skipping: bot/sentinel commit by ${author_login:-$author_name} <$author_email>"
  exit 0
fi

# Skip ATLAS/ZEUS watch/heartbeat/catalog/mesh commits that don't change app code.
# Fix 10: added chore(mesh): pattern — mesh refresh commits were triggering canceled builds.
if [[ "$subject" =~ ^(heartbeat:|chore\(catalog\)|chore\(mesh\):|chore\(sweep\):|zeus:.*verification|aurea:.*close|ATLAS.*watch|atlas:.*watch) ]]; then
  echo "Skipping: agent watch commit — $subject"
  exit 0
fi

# OPT-2 (C-321): cursor/* branches never deploy — agent branches are noise.
if [[ "$branch" =~ ^cursor/ ]]; then
  echo "Skipping: cursor/* branch ($branch)"
  exit 0
fi

# OPT-2 (C-321): claude/* agent branches don't deploy unless explicitly tagged.
if [[ "$branch" =~ ^claude/ ]] && [[ "$subject" != *"[deploy]"* ]]; then
  echo "Skipping: claude/* agent branch ($branch) without [deploy] tag"
  exit 0
fi

# ── Content-based skips — only when we can PROVE what changed. ───────────────
# C-335: FAIL OPEN. The old checks treated "git diff produced nothing" (which
# also happens on a shallow clone / missing history / first commit) the same
# as "nothing outside docs/lockfiles changed", and skipped — a false skip that
# could silently drop a real deploy. Now we only skip when the diff succeeded
# AND proves the change is confined to lockfiles or docs/; any failure to
# compute the diff falls through to building.
diff_ok=false
changed="$(git diff --name-only HEAD~1 HEAD 2>/dev/null)" && diff_ok=true || true

if [[ "$diff_ok" == true && -n "$changed" ]]; then
  # OPT-1 (C-321): lockfile-only commits — only skip when no app code actually
  # changed. Guard: check git diff to prevent message-match from swallowing
  # real code changes.
  if [[ "$subject" =~ ^chore(\([^\)]*\))?:?[[:space:]]*(sync pnpm.lock|update lockfile|pnpm-lock) ]]; then
    changed_non_lock="$(printf '%s\n' "$changed" \
      | grep -vE '^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|docs/)' | head -1 || true)"
    if [[ -z "$changed_non_lock" ]]; then
      echo "Skipping: lockfile-only commit (verified via diff) — $subject"
      exit 0
    fi
  fi

  # Skip commits that only modify docs/ (no app code changes).
  changed_outside_docs="$(printf '%s\n' "$changed" | grep -v '^docs/' | head -1 || true)"
  if [[ -z "$changed_outside_docs" ]]; then
    echo "Skipping: docs-only change — $subject"
    exit 0
  fi
fi

# OPT-1 (C-321): catalog / mesh refresh commits (message-pattern; content-based
# checks above don't cover commits whose changed files aren't lockfiles/docs).
if [[ "$subject" =~ ^chore(\([^\)]*\))?:?[[:space:]]*(update Mobius Catalog|refresh cycle state) ]]; then
  echo "Skipping: catalog/mesh refresh commit — $subject"
  exit 0
fi

echo "Building: $subject"
exit 1
