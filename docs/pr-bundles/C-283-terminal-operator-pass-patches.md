# C-283 Operator Pass — Patch reference

Canonical implementations live in the repository on the C-283 branch (merge to `main` as the source of truth). This note records what each touched file does so operators can audit without diffing from memory.

## 1) `components/terminal/TerminalShell.tsx`

- Replaced parallel `/api/integrity-status` + `/api/runtime/status` polling with `useTerminalSnapshot()`.
- GI from `snapshot.gi` or `snapshot.integrity.data.global_integrity`; cycle from `snapshot.cycle` or integrity leaf.
- Runtime badge: `offline` while loading without snapshot; `degraded` when `snapshot.degraded` or GI mode yellow/red; else `online`.
- Live UTC clock in header (1s interval); console collapse still syncs via `mobius:console-toggle`.

## 2) `components/terminal/FooterStatusBar.tsx`

- Fetches `/api/health` every 30s (`AbortSignal.timeout(5000)`).
- Surfaces `status`, `kv.available`, pulse age, runtime/journal heartbeat ages, tripwire count and elevation.

## 3) `app/terminal/journal/JournalPageClient.tsx`

- Journal entry type extended with optional `status`, `severity`, `scope` from API.
- Operator-first sort after filters: current cycle first, then cycle ordinal, status rank, severity rank, confidence, timestamp.
- EPICON-derived rows use `currentCycleId()` for cycle; zeus-verify → verified status; severity mapped from EPICON severity string.
- Empty-state agent rows no longer reference `C-274`.
- Recommendation line omitted when trimmed text equals inference.

## 4) `app/api/echo/feed/route.ts`

- `GET` accepts `NextRequest`; query `sort=time` uses timestamp-only sort.
- Default merges KV + in-memory ledger, dedupes by id, sorts with operator-first comparator, caps at 100.
- JSON includes `meta: { ledger_sort: 'operator' | 'time' }`.
