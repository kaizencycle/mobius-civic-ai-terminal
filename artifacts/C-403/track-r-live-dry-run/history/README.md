# Track R evidence archives (C-403)

Immutable capture bundles live under `history/<capture-id>/`. Do not overwrite these paths when a new capture lands.

| Capture | Immutable path | Role |
|---|---|---|
| #4 `track-r-c403-2026-08-14T2324Z` | `history/capture-2324Z/` | Pin establishment (pre-pin comparison) |
| #5 `track-r-c403-2026-08-15T0123Z` | `history/capture-0123Z/` | Pin-validated attestation packet |

The rolling directory `artifacts/C-403/track-r-live-dry-run/` (parent of this file) mirrors **capture #5** for operator convenience. Governance binds to **`history/capture-0123Z/`** hashes.

Handoffs:
- Capture #4: `docs/epicon/cycles/C-403/HANDOFF_C-403_TRACK_R_ATTESTATION_capture-2324Z.md`
- Capture #5: `docs/epicon/cycles/C-403/HANDOFF_C-403_TRACK_R_ATTESTATION_capture-0123Z.md`
