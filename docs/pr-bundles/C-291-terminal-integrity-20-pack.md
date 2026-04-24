# C-291 — Terminal Integrity 20-Pack

## Scope

This pass fixes the P2 tier-filter leakage reported against `hooks/useJournalChamber.ts` and adds a defensive Journal chamber hardening pass.

Primary issue: when a non-`ALL` DVA tier is selected, unscoped preview rows with no `agent` / `agentOrigin` were retained. During initial hydration, and especially during predictive stabilization with `lockToPreview`, fallback digest rows could appear inside the wrong tier view.

## Follow-up fixes

Codex review surfaced two additional P2 issues after the first pass:

1. Conflicting tier/agent filters widened back to the tier default. Example: `tier=t2&agent=EVE` returned ATLAS/ZEUS rows instead of no rows.
2. `currentCycle` was frozen at mount via `useMemo(..., [])`, so long-lived Journal tabs could mis-prioritize rows after the ET cycle rollover.

Both are fixed in this PR.

## Fix summary

- Non-`ALL` tier filters now require provable agent origin before a preview row can be shown.
- Digest fallback rows now carry explicit `ECHO` provenance instead of anonymous preview metadata.
- The Journal chamber API now intersects explicit `agent` query params with the selected tier and keeps empty intersections empty.
- EPICON-derived fallback rows in the UI now use the same tier gate as native journal rows.
- Current cycle is refreshed every minute so open Journal tabs roll over without a full page reload.

## 20 optimizations

1. Exclude unscoped preview journal rows whenever the selected tier is not `ALL`.
2. Normalize preview agent detection across `agentOrigin`, `agent`, `sourceAgent`, `author`, and `source`.
3. Attach explicit `ECHO` metadata to digest fallback bucket rows.
4. Clamp client-side journal request limits to the supported 1–100 range.
5. Memoize tier-agent resolution for stable URL construction and preview scoping.
6. Return `tier`, `tier_agents`, and `scoped` metadata in the chamber payload.
7. Normalize API tier params case-insensitively.
8. De-duplicate explicit `agent` query params.
9. Preserve empty tier/agent intersections instead of broadening back to the full tier.
10. Clamp API request limits before forwarding to the canonical journal route.
11. Re-filter `entries` in the chamber API after the downstream journal response as defense-in-depth.
12. Return an accurate `count` after post-filtering.
13. Set `canonical_available` only when canonical archive rows are actually fetched.
14. Mark chamber `fallback` / `degraded` when downstream status or archive errors indicate degraded integrity.
15. Add `Cache-Control: no-store` to Journal chamber responses.
16. Scope EPICON-derived fallback rows in the UI using the same tier rules as native journal entries.
17. Avoid fetching EPICON fallback rows while journal hydration is still actively in progress.
18. Abort EPICON fallback fetches on unmount or tier changes.
19. Clean and de-duplicate missing-related-entry timers to prevent stacked timeout state updates.
20. Refresh the current cycle every minute so sorting, seeded cycle tabs, and invalid-cycle resets survive cycle rollover.

## Files changed

- `hooks/useJournalChamber.ts`
- `app/api/chambers/journal/route.ts`
- `app/terminal/journal/JournalPageClient.tsx`

## Validation notes

- Vercel fetch of `https://mobius-civic-ai-terminal.vercel.app/terminal` returned HTTP 200 and rendered the terminal shell.
- Local clone/build could not be run in this execution container because DNS resolution for `github.com` failed.
- Changes were applied through the GitHub connector on branch `c291-terminal-integrity-20-pack`.
