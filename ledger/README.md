# Terminal ledger artifacts (C-288 / C-370)

This directory holds **committed mesh continuity artifacts** produced by GitHub Actions (not runtime secrets).

| File | Producer | Purpose |
|------|----------|---------|
| `cycle-state.json` | `.github/workflows/publish-cycle-state.yml` | Federation pulse (`MOBIUS_CYCLE_STATE_V2`) for HIVE / Substrate / shell / agents |

Schema: see `docs/epicon/cycles/C-370/CYCLE_STATE_V2.md`.

Re-run locally after fetching live inputs:

```bash
curl -fsSL "https://mobius-civic-ai-terminal.vercel.app/api/terminal/snapshot-lite" -o snapshot.json
curl -fsSL "https://mobius-civic-ai-terminal.vercel.app/api/vault/status" -o vault-status.json
curl -fsSL "https://raw.githubusercontent.com/kaizencycle/Mobius-Substrate/main/canon/reserve-blocks/MANIFEST.json" -o manifest.json
node scripts/mesh/write-cycle-state.js snapshot.json vault-status.json manifest.json
node scripts/gen-cycle-docs.mjs
```

Do not hand-edit `cycle-state.json` for production truth; let the workflow refresh it.
