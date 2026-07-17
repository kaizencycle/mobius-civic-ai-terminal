# Terminal Log Discipline (C-375)

Production logs are the Terminal's self-report. Severity labels must track reality so operators (and future Pulse calibration per OAA Charter §7.1) can trust the channel.

## Severity contract

| Level | Meaning | Examples |
| --- | --- | --- |
| **error** | Broken — requires action or filed issue | Escalated fingerprints, cron hard failures, attest protocol mismatch |
| **warn** | Degraded or refused — expected gates | `vault-v2` 409 seal-integrity blocks, `[ledger-zeus] journal fetch` (pre-escalation), credit cooldown |
| **info** | State transitions | `[identity-token] cache_hit`, `[swarm] state: exiting cooldown`, successful cron summaries |
| **debug** | Diagnostic volume | Suppressed in production unless `LOG_LEVEL=debug` |

## Rules

1. **Deprecation warnings never log at error level.** Node `DEP0169` (`url.parse`) is dependency-originated in this repo — no first-party `url.parse` calls. Custodian stopgap: set Vercel env `NODE_OPTIONS=--disable-warning=DEP0169` until the upstream package is upgraded (Michael applies env; track issue for dependency fix).

2. **Expected gate refusals stay at warning.** Seal-integrity-gate 409s with collision reason must remain loud — do not silence or downgrade.

3. **Repeating warning fingerprints escalate.** After **6** consecutive identical failures (~1h at 10min cadence), `lib/log/warningEscalation.ts` emits one **error** with fingerprint label for custodian issue dedup (canon-drift-tripwire pattern). Cleared on success.

4. **In-process handlers over self-HTTP** where crons previously fetched their own deployment HTML (ledger-zeus → journal).

## Lane map (C-375 handoff)

| Lane | Fix |
| --- | --- |
| DEP0169 | `NODE_OPTIONS` stopgap + dependency trace (`docs/pr-bundles/C-291-url-parse-deprecation-trace.md`) |
| ledger-zeus journal | In-process journal handler + fingerprint escalation |
| identity-token | `cache_hit` / `source` logging on attest bearer path |
| swarm | `*/30` cadence (vercel.json), tier>1 cap per run, cooldown state logs |
| OG font | Bundled `app/api/og/fonts/JetBrainsMono-Regular.woff2` |

## Environment

| Variable | Purpose |
| --- | --- |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` (default `info` in production) |
| `NODE_OPTIONS` | `--disable-warning=DEP0169` (custodian-applied stopgap) |
| `SWARM_MAX_TIER_GT1_PER_RUN` | Cap Sonnet/Opus agents per swarm run (default `2`) |
| `IDENTITY_JWT_CACHE_SECONDS` | KV/memory cache TTL for attest JWT (default `600`) |

## Restraint

This document does not authorize changes to vault/status computation, seal lineage, integrity-gate logic, or identity-service deployment.
