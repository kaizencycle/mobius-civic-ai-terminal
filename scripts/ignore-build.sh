#!/usr/bin/env bash
set -euo pipefail

subject="$(git log -1 --format=%s)"
author="$(git log -1 --format=%ae)"

if [[ "$subject" == *"[skip ci]"* ]]; then
  echo "Skipping: [skip ci] in commit message"
  exit 0
fi

if [[ "$author" =~ ^(bot@mobius\.substrate|cursoragent@cursor\.com)$ ]]; then
  echo "Skipping: bot commit by $author"
  exit 0
fi

echo "Building: $subject"
exit 1
