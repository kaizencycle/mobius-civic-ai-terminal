#!/usr/bin/env bash
# scripts/setup-branch-protection.sh — C-336.
#
# Enforces the guardrails at the platform layer instead of on trust. Run this
# ONCE, by hand, as the operator (requires `gh` authenticated with admin on the
# repo). It is intentionally NOT wired into any workflow — changing branch
# protection is a Tier-3, consequential act.
#
# NOTE: this is a user-owned repo, so push "restrictions" (user/team allowlists)
# are not settable via this API for non-org repos — enforcement here leans on
# required status checks + required CODEOWNER review instead.
set -euo pipefail

REPO="${REPO:-kaizencycle/mobius-civic-ai-terminal}"
BRANCH="${BRANCH:-main}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found. Install: https://cli.github.com/" >&2
  exit 1
fi

PAYLOAD=$(cat <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["scope-guard", "contract", "guard", "sentinel", "gi-gate"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true
}
JSON
)

echo "Applying branch protection to $REPO@$BRANCH ..."
gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" \
  -H "Accept: application/vnd.github+json" --input - <<<"$PAYLOAD"

echo ""
echo "Done. Required checks: scope-guard, contract, guard, sentinel, gi-gate."
echo "CODEOWNER review required (1 approval); force-push & deletion disabled; linear history on."
echo "Re-run any time — this is idempotent (PUT replaces the protection config)."
