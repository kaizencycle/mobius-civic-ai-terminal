# Mobius Terminal PR — example body (CI golden)

Used by `scripts/validate-pr-template-intent.mjs` to ensure §3 matches EPICON Guard v1.
Authors: copy the `intent` block from `.github/PULL_REQUEST_TEMPLATE.md` §3 and replace placeholders.

```intent
epicon_id: EPICON_C-384_ci_pr-template-epicon-guard_v1
ledger_id: kaizencycle
scope: ci
mode: normal
issued_at: 2026-07-26T15:00:00Z
expires_at: 2027-07-26T15:00:00Z

justification:
  VALUES INVOKED: Metric Humility; the template teaches what the Intent Publication Gate enforces.
  REASONING: EPICON Guard reads only intent-fenced blocks; prose and generic text fences are invisible to the parser.
  ANCHORS:
    - .github/PULL_REQUEST_TEMPLATE.md §3
    - kaizencycle/epicon@v1 src/validate.mjs (extractIntentBlocks, I6 justification keys)
  BOUNDARIES: Does not change runtime API behavior, KV schema, or auth paths.
  COUNTERFACTUAL: If this example fails validation, fix the template before merging any other lane.

counterfactuals:
  - If scope does not match changed paths, widen scope via intent re-publication or split the PR.
  - If expires_at is in the past, refresh issued_at and expires_at before merge.
```
