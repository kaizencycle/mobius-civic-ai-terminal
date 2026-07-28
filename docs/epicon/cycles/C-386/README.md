# C-386 — Agent memory quorum doctrine (terminal application)

**Status:** In flight — KV memory contract on Substrate; EVE news feed provenance sub-cycle on terminal.

| Artifact | Repo | Purpose |
|----------|------|---------|
| `HANDOFF_C-386_ZEUS_news-feed-provenance_v1.md` | terminal | ZEUS adversarial review for EVE global-news patch |
| Substrate `docs/epicon/cycles/C-386/` | Mobius-Substrate | ATLAS implementation + KV memory library |

**Doctrine:** Evidentiary independence (quorum) is not agent headcount. News feed patch applies the same rule to `EveNewsItem.root_id` / `independent_source_count` before ECHO integrity scoring.

**Follow-on (not in first patch):** Gate `computeGlobalTension('high')` on `independent_source_count >= 2`.
