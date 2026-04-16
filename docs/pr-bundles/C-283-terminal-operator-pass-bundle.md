# Mobius Terminal PR Bundle — C-283

## Title

`fix(c283): operator-first shell + journal + ledger pass`

## Summary

This bundle applies five operator-facing optimizations after scanning the live terminal, the public APIs, and the current main-branch repo state.

### Live findings

- The public terminal still bootstraps through a guarded shell before richer operator state becomes visible.
- `/api/health` and `/api/integrity-status` expose more truthful state than the current footer and some shell text surfaces show.
- Journal traffic has increased materially in C-283 and now needs operator-first sorting rather than simple recency.
- The ledger still caps at 100 rows and benefits from weighted retention instead of pure timestamp order.

## The 5 optimizations

1. **Terminal shell now boots from terminal snapshot state** (`components/terminal/TerminalShell.tsx`)
   - Uses `useTerminalSnapshot()` instead of separate integrity/runtime fetches.
   - Reduces blank shell time and keeps header cycle/GI aligned with snapshot-lite/full behavior.

2. **Footer status bar now shows real health truth** (`components/terminal/FooterStatusBar.tsx`)
   - Reads `/api/health` instead of `/api/kv/health`.
   - Shows pulse/runtime/journal heartbeat ages and tripwire posture from the health payload.

3. **Journal chamber becomes operator-first** (`app/terminal/journal/JournalPageClient.tsx`)
   - Sorts by cycle (current first), status, severity, confidence, then timestamp.
   - Removes stale `C-274` fallback language.
   - Hides duplicated recommendation text when it matches inference.
   - Status and severity badges in the card header.

4. **Ledger feed gets weighted retention** (`app/api/echo/feed/route.ts`)
   - Default ledger sort is operator-first (cycle, committed status, confidence tier, civic/governance/infrastructure category weight, then timestamp).
   - `?sort=time` restores pure recency order.
   - Response includes `meta.ledger_sort`.

5. **PR bundle captured in-repo** (this directory)
   - Records intent, scope, risks, and rollback guidance for audit continuity.

## Risk tier

- **Tier 1**
- App logic only
- No auth removal
- No KV schema changes
- No GI formula changes

## Verification checklist

- [ ] `pnpm exec tsc --noEmit`
- [ ] `pnpm build`
- [ ] Confirm shell header shows GI + cycle from snapshot on first boot
- [ ] Confirm footer heartbeat ages reflect `/api/health`
- [ ] Confirm journal view sorts current-cycle critical/verified rows above routine observations
- [ ] Confirm ledger default order surfaces operator-important rows before routine recency noise

## Rollback

Revert the PR branch or restore the previous versions of:

- `components/terminal/TerminalShell.tsx`
- `components/terminal/FooterStatusBar.tsx`
- `app/terminal/journal/JournalPageClient.tsx`
- `app/api/echo/feed/route.ts`
- `docs/pr-bundles/C-283-terminal-operator-pass-bundle.md`

---

We heal as we walk.
