# PR: Reserve Block .dat Canonization — C-357 (Claude Code)

**Branch:** `cursor/c357-dat-canonization-a40d`

## Agentic execution order

1. Merge CPC PR first (table + routes)
2. Merge terminal PR (lib + scripts + UI)
3. Run `npx tsx scripts/canonize-reserve-blocks.ts` locally with KV creds
4. Copy generated `.dat` + MANIFEST to Substrate `canon/reserve-blocks/`
5. Merge Substrate PR → GitHub Action verifies chain

## CPC endpoints (after deploy)

```bash
curl "$CIVIC_LEDGER_URL/api/canon/reserve-blocks/manifest"
curl "$CIVIC_LEDGER_URL/api/canon/reserve-blocks/verify"
```

## Secrets required

- Terminal: `AGENT_SERVICE_TOKEN`, `KV_REST_API_*`, `CIVIC_LEDGER_URL`
- Substrate GH Action: `SUBSTRATE_SERVICE_TOKEN`, `TERMINAL_API_BASE`
