#!/usr/bin/env bash
set -euo pipefail

subject="$(git log -1 --format=%s)"
author_email="$(git log -1 --format=%ae)"
author_name="$(git log -1 --format=%an)"

if [[ "$subject" == *"[skip ci]"* ]]; then
  echo "Skipping: [skip ci] in commit message"
  exit 0
fi

# Match mobius-bot identity (name) and legacy bot emails used on CI / Cursor.
# Fix 10: expanded to catch github-actions bot and any noreply.github.com identity.
if [[ "$author_name" == "mobius-bot" ]] \
  || [[ "$author_name" == "github-actions[bot]" ]] \
  || [[ "$author_email" =~ ^(bot@mobius\.substrate|cursoragent@cursor\.com)$ ]] \
  || [[ "$author_email" =~ \.noreply\.github\.com$ ]]; then
  echo "Skipping: bot commit by $author_name <$author_email>"
  exit 0
fi

# Skip ATLAS/ZEUS watch/heartbeat/catalog/mesh commits that don't change app code.
# Fix 10: added chore(mesh): pattern — mesh refresh commits were triggering canceled builds.
if [[ "$subject" =~ ^(heartbeat:|chore\(catalog\)|chore\(mesh\):|zeus:.*verification|ATLAS.*watch) ]]; then
  echo "Skipping: agent watch commit — $subject"
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
