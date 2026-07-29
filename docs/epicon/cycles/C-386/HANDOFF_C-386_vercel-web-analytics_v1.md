# C-386 — Vercel Web Analytics (terminal)

**Status:** Implemented on branch `cursor/c386-vercel-web-analytics-0e02`  
**Risk:** LOW — client-side **page views** (and custom events) via `@vercel/analytics`; no auth or KV changes

**Not in this patch:** [Web Vitals](https://vercel.com/docs/speed-insights) / Core Web Vitals require `@vercel/speed-insights` and `<SpeedInsights />` separately from Web Analytics.

## Scope-guard note

`package.json` / `pnpm-lock.yaml` are **Tier-3 (operator-only)**. PRs authored by `vercel[bot]` or other agents **fail scope-guard** even with a valid EPICON intent. Open the merge PR as **kaizencycle** (owner) or cherry-pick this branch under an owner-authored PR.

## Rollback

```bash
git revert <merge-commit-sha>
# Removes <Analytics /> from app/layout.tsx and @vercel/analytics from package.json
```
