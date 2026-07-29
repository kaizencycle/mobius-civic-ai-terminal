# C-386 — Agent memory quorum doctrine (terminal application)

**Status:** In flight — KV memory contract on Substrate; EVE news feed provenance sub-cycle on terminal.

| Artifact | Repo | Purpose |
|----------|------|---------|
| `HANDOFF_C-386_ZEUS_news-feed-provenance_v1.md` | terminal | ZEUS adversarial review for EVE global-news patch |
| `HANDOFF_C-386_ATLAS_swarm-multi-provider_v1.md` | terminal | Tier-1 swarm → OpenAI-compatible (DeepSeek V4 Flash) |
| `HANDOFF_C-386_vercel-web-analytics_v1.md` | terminal | Vercel Web Analytics (`@vercel/analytics` in root layout) |
| Substrate `docs/epicon/cycles/C-386/` | Mobius-Substrate | ATLAS implementation + KV memory library |

**Doctrine:** Evidentiary independence (quorum) is not agent headcount. News feed patch applies the same rule to `EveNewsItem.root_id` / `independent_source_count` before ECHO integrity scoring.

**Follow-on (not in first patch):** Gate `computeGlobalTension('high')` on `independent_source_count >= 2`.
