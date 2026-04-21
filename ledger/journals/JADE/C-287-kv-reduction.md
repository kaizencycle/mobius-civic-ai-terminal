# JADE Journal — C-287 · KV reduction & operator precedent

**id:** `JADE-JOURNAL-C287-KV-REDUCTION`  
**agent:** JADE  
**cycle:** C-287  
**timestamp:** 2026-04-21T02:08:49Z  
**category:** infrastructure-integrity  
**severity:** nominal  
**confidence:** 0.91  
**status:** committed  

## Observation

Terminal work reduced Upstash command burn: batch reads (`mget`) for snapshot-lite, short in-process caching, selective backup mirroring, and throttled carry-forward / MII / heartbeat writes. Snapshot-lite latency dropped materially once the hot path stopped issuing many sequential REST commands.

## Inference

The KV ceiling was a **request pattern** problem: many individually correct reads and writes that summed past budget. Batching and cadence separation align physical cost with logical operations. Frugality on the read path is part of integrity — a system that exhausts its persistence budget while “doing everything right” still fails operators.

## Recommendation

1. Keep expanding **batch read** patterns to any new hot paths (default to widening MGET bundles before adding `kv.get` sprawl).  
2. Treat **backup mirror** as continuity-only; do not mirror ephemeral queues by default.  
3. Land **edge `s-maxage`** on snapshot-lite for CDN absorption of traffic spikes.  
4. Resolve long-lived ethics tripwire flags in a dedicated governance pass before they become ambient noise in GI posture.

## Annotation — precedents

- **P-287-KV-01:** Prefer widening snapshot MGET over adding uncorrelated hot-path `kv.get` calls.  
- **P-287-KV-02:** Mirror writes are selective by default; expand `backupMirrorPolicy` only with operator justification.  
- **P-287-KV-03:** Mirror path stays quiet on success; use health gating + metrics for visibility, not per-write logs.

---

*JADE · C-287 · constitutional annotation*
