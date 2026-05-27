#!/usr/bin/env bash
# C-305 OPT-01 + C-314 T-01: Vercel ignoreCommand gate — exit 0 = skip build, exit 1 = build.
# Prefer VERCEL_GIT_* when present (ignoreCommand runs before full clone in some paths).
set -euo pipefail

subject="${VERCEL_GIT_COMMIT_MESSAGE:-}"
author_email="${VERCEL_GIT_COMMIT_AUTHOR_EMAIL:-}"
author_name="${VERCEL_GIT_COMMIT_AUTHOR_NAME:-}"
author_login="${VERCEL_GIT_COMMIT_AUTHOR_LOGIN:-}"

if [[ -z "$subject" ]]; then
  subject="$(git log -1 --format=%s 2>/dev/null || echo "")"
fi
if [[ -z "$author_email" ]]; then
  author_email="$(git log -1 --format=%ae 2>/dev/null || echo "")"
fi
if [[ -z "$author_name" ]]; then
  author_name="$(git log -1 --format=%an 2>/dev/null || echo "")"
fi

if [[ "$subject" == *"[skip ci]"* ]] || [[ "$subject" == *"[skip deploy]"* ]]; then
  echo "Skipping: skip directive in commit message"
  exit 0
fi

# Sentinel + catalog bot addresses (explicit + mobius.systems agent inboxes).
SENTINEL_EMAILS=(
  "bot@mobius.systems"
  "bot@mobius.substrate"
  "atlas@mobius.systems"
  "zeus@mobius.systems"
  "eve@mobius.systems"
  "jade@mobius.systems"
  "aurea@mobius.systems"
  "hermes@mobius.systems"
  "echo@mobius.systems"
  "daedalus@mobius.systems"
)

is_listed_sentinel=false
for em in "${SENTINEL_EMAILS[@]}"; do
  if [[ "${author_email,,}" == "${em,,}" ]]; then
    is_listed_sentinel=true
    break
  fi
done

# Match mobius-bot identity (name/login) and legacy bot emails used on CI / Cursor.
# C-323 INFRA-05: added VERCEL_GIT_COMMIT_AUTHOR_LOGIN check — more reliable than name/email
# for GitHub Actions bot (login = "github-actions[bot]") and mobius-bot (login = "mobius-bot").
if [[ "$author_login" == "mobius-bot" ]] \
  || [[ "$author_login" == "github-actions[bot]" ]] \
  || [[ "$author_name" == "mobius-bot" ]] \
  || [[ "$author_name" == "github-actions[bot]" ]] \
  || [[ "$is_listed_sentinel" == true ]] \
  || [[ "$author_email" =~ ^(bot@mobius\.systems|bot@mobius\.substrate|bot@mobius\.internal|cursoragent@cursor\.com)$ ]] \
  || [[ "$author_email" =~ ^(atlas|zeus|eve|jade|aurea|hermes|echo|daedalus)@mobius\.systems$ ]] \
  || [[ "$author_email" =~ @mobius\.substrate$ ]] \
  || [[ "$author_email" =~ \.noreply\.github\.com$ ]]; then
  echo "Skipping: bot/sentinel commit by ${author_login:-$author_name} <$author_email>"
  exit 0
fi

# Skip ATLAS/ZEUS watch/heartbeat/catalog/mesh commits that don't change app code.
# Fix 10: added chore(mesh): pattern — mesh refresh commits were triggering canceled builds.
if [[ "$subject" =~ ^(heartbeat:|chore\(catalog\)|chore\(mesh\):|chore\(sweep\):|zeus:.*verification|ATLAS.*watch) ]]; then
  echo "Skipping: agent watch commit — $subject"
  exit 0
fi

# OPT-1 (C-321): lockfile-only commits — only skip when no app code actually changed.
# Guard: check git diff to prevent message-match from swallowing real code changes.
if [[ "$subject" =~ ^chore(\([^\)]*\))?:?[[:space:]]*(sync pnpm.lock|update lockfile|pnpm-lock) ]]; then
  changed_non_lock="$(git diff --name-only HEAD~1 HEAD 2>/dev/null \
    | grep -vE '^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|docs/)' | head -1 || true)"
  if [[ -z "$changed_non_lock" ]]; then
    echo "Skipping: lockfile-only commit (verified via diff) — $subject"
    exit 0
  fi
fi

# OPT-1 (C-321): catalog / mesh refresh commits.
if [[ "$subject" =~ ^chore(\([^\)]*\))?:?[[:space:]]*(update Mobius Catalog|refresh cycle state) ]]; then
  echo "Skipping: catalog/mesh refresh commit — $subject"
  exit 0
fi

# OPT-2 (C-321): cursor/* branches never deploy — agent branches are noise.
branch="${VERCEL_GIT_COMMIT_REF:-}"
if [[ -z "$branch" ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
fi
if [[ "$branch" =~ ^cursor/ ]]; then
  echo "Skipping: cursor/* branch ($branch)"
  exit 0
fi

# OPT-2 (C-321): claude/* agent branches don't deploy unless explicitly tagged.
if [[ "$branch" =~ ^claude/ ]] && [[ "$subject" != *"[deploy]"* ]]; then
  echo "Skipping: claude/* agent branch ($branch) without [deploy] tag"
  exit 0
fi

# Skip commits that only modify docs/catalog/ (no app code changes)
changed_outside_docs="$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -v '^docs/' | head -1 || true)"
if [[ -z "$changed_outside_docs" ]]; then
  echo "Skipping: docs-only change — $subject"
  exit 0
fi

echo "Building: $subject"
exit 1
