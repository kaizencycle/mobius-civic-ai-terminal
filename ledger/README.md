# Terminal ledger artifacts (C-288)

This directory holds **committed mesh continuity artifacts** produced by GitHub Actions (not runtime secrets).

| File | Producer | Purpose |
|------|----------|---------|
| `cycle-state.json` | `.github/workflows/publish-cycle-state.yml` | Latest `snapshot-lite` summary for HIVE / Substrate / shell consumers |

Re-run locally after fetching a snapshot:

```bash
curl -fsSL "https://mobius-civic-ai-terminal.vercel.app/api/terminal/snapshot-lite" -o snapshot.json
node scripts/mesh/write-cycle-state.js snapshot.json
```

Do not hand-edit `cycle-state.json` for production truth; let the workflow refresh it.
