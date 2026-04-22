# C-289 — Terminal Journal Canon + Agent Liveness

## Scope implemented

- `/api/agents/journal` now supports `mode=hot|canon|merged` with `merged` as default.
- Journal entries expose runtime source metadata (`source_mode`) and canonical path when substrate-backed.
- `/api/agents/journal` POST now requires canonical substrate write success before returning success.
- Canonical write response now returns `canonical`, `path`, and `mirrored_to_kv` flags.
- `/api/agents/status` now derives liveness states (`DECLARED|BOOTING|ACTIVE|DEGRADED|OFFLINE|CONTESTED`) and proof fields.
- Added `/api/agents/liveness` endpoint for liveness-focused payloads.
- `/api/terminal/snapshot` accepts `journal_mode` and `journal_limit` and now emits `journal_summary` and `agent_liveness` blocks.
- Journal chamber UI now includes `HOT/CANON/MERGED` mode selector.
- Journal cards now expose `KV/SUBSTRATE` source badges and canonical path when available.
- Sentinel agent cards now display proof badges and confidence.

## Notes

- Substrate remains canonical journal memory.
- KV remains hot operational mirror.
- Liveness remains explicit proof-based state, not cosmetic card presence.
