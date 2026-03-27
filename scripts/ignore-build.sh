#!/usr/bin/env bash
set -euo pipefail

subject="$(git log -1 --format=%s)"
author_email="$(git log -1 --format=%ae)"
author_name="$(git log -1 --format=%an)"

if [[ "$subject" == *"[skip ci]"* ]]; then
  echo "Skipping: [skip ci] in commit message"
  exit 0
fi

# Match C-623 mobius-bot identity (name) and legacy bot emails used on CI / Cursor.
if [[ "$author_name" == "mobius-bot" ]] \
  || [[ "$author_email" =~ ^(bot@mobius\.substrate|cursoragent@cursor\.com)$ ]]; then
  echo "Skipping: bot commit by $author_name <$author_email>"
  exit 0
fi

echo "Building: $subject"
exit 1
