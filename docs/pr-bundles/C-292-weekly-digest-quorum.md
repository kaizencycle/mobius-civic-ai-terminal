# C-292 — EVE x JADE Weekly Digest Quorum

## Purpose

Build a weekly digest system that turns 7 days of Mobius activity into a structured, verified, canon-ready synthesis.

This should not be a new personality agent yet. Instead, the duties are split between existing agents:

- EVE — synthesis, meaning, narrative coherence
- JADE — verification, factual integrity, canon alignment
- ZEUS — optional final seal for high-importance weekly reports

Core principle:

> EVE gives the week a voice. JADE makes sure the voice remembers correctly.

## Problem

Mobius currently has many live data lanes:

- KV writes
- Snapshot
- Snapshot-lite
- Terminal watermark
- EPICON feed
- Agent journals
- Ledger events
- Tripwires
- GI posture
- Vault events
- Canon outbox
- Substrate journal archive

But there is no weekly compiler that answers:

- What actually happened this week?
- Which cycles improved?
- Which cycles degraded?
- Which agents were active?
- Which data lanes were stale or healthy?
- Which journal entries reached canon?
- What should be done next?

The Terminal needs a verified weekly memory layer.

## Proposed System

Create an EVE x JADE Weekly Digest Quorum.

Digest lifecycle:

1. DRAFT
2. EVE_SYNTHESIZED
3. JADE_VERIFIED
4. CANON_SEALED

If JADE finds problems:

1. EVE_SYNTHESIZED
2. JADE_CONTESTED
3. EVE_REVISION_REQUIRED

## Agent Roles

### EVE — Weekly Synthesis

EVE reads narrative-bearing lanes and produces the digest draft.

EVE asks:

- What happened?
- What changed?
- What patterns emerged?
- What did Mobius learn?
- What should the operator do next?

EVE parses:

- Agent journals
- EPICON feed
- Cycle notes
- Agent activity
- Improvement/regression themes
- Operator-facing narrative context

EVE writes:

- Weekly headline
- Executive summary
- Cycle-by-cycle story
- Improvements
- Regressions
- Recommendations
- What Mobius learned this week

EVE cannot seal the digest alone.

### JADE — Weekly Verification

JADE reads integrity-bearing lanes and verifies EVE's draft.

JADE asks:

- Is this true?
- Are the counts correct?
- Are there unsupported claims?
- Are cycles ordered correctly?
- Are KV and Substrate aligned?
- Are canon statuses accurate?
- Did EVE overstate anything?

JADE parses:

- GI timeline
- Tripwires
- Snapshot freshness
- Snapshot-lite freshness
- Terminal watermark
- Canon outbox
- Substrate confirmations
- Ledger consistency
- Journal canon status

JADE writes:

- Verification report
- Canon confidence score
- Unsupported claims list
- Missing source notes
- Contradictions
- Final recommendation: safe_to_seal, revision_required, or block_seal

### ZEUS — Optional Seal

ZEUS should only be used for high-importance digest seals.

ZEUS verifies procedure, not meaning.

ZEUS can write:

- Final weekly seal attestation
- Digest seal hash
- Procedural approval

ZEUS should not rewrite EVE's synthesis or JADE's verification.

## Data Lanes

The digest should parse the last 7 days of:

- terminal:watermark
- snapshot-lite
- snapshot
- agent journals
- EPICON feed
- ledger feed
- GI history
- tripwire events
- canon outbox
- vault events
- Substrate journal archive

## Digest Sections

The weekly digest should include:

1. Executive Summary
2. One-Line Takeaway
3. 7-Day GI Timeline
4. Cycle-by-Cycle Summary
5. Agent Activity Matrix
6. Dataflow Health
7. Journal Canon Status
8. Snapshot / Snapshot-lite Freshness
9. Tripwire Summary
10. Top Anomalies
11. Improvements
12. Regressions
13. What Mobius Learned
14. Next 7 Actions
15. JADE Verification Report
16. Canon Seal Status

## Proposed Schema

```ts
export type WeeklyDigestStatus =
  | 'draft'
  | 'eve_synthesized'
  | 'jade_verified'
  | 'jade_contested'
  | 'revision_required'
  | 'canon_sealed';

export type WeeklyDigest = {
  id: string;
  weekStart: string;
  weekEnd: string;
  cycles: string[];
  generatedAt: string;
  status: WeeklyDigestStatus;

  synthesizedBy: 'EVE';
  verifiedBy?: 'JADE';
  sealedBy?: 'ZEUS';

  summary: {
    headline: string;
    oneLineTakeaway: string;
    health: 'improved' | 'stable' | 'degraded' | 'mixed';
    executiveSummary: string;
  };

  gi: {
    start: number | null;
    end: number | null;
    high: number | null;
    low: number | null;
    delta: number | null;
    timeline: Array<{
      cycle: string;
      gi: number | null;
      posture: string;
      timestamp: string;
    }>;
  };

  cyclesSummary: Array<{
    cycle: string;
    headline: string;
    improved: string[];
    degraded: string[];
    notes: string[];
  }>;

  agents: Array<{
    agent: string;
    journalCount: number;
    canonWritten: number;
    canonPending: number;
    canonFailed: number;
    topThemes: string[];
  }>;

  dataflow: {
    kvWrites: number;
    snapshotUpdates: number;
    snapshotLiteUpdates: number;
    watermarkUpdates: number;
    canonWrites: number;
    canonPending: number;
    canonFailures: number;
    staleLanes: string[];
  };

  tripwires: Array<{
    name: string;
    count: number;
    severity: 'nominal' | 'elevated' | 'critical';
    resolved: boolean;
  }>;

  anomalies: Array<{
    title: string;
    severity: 'low' | 'medium' | 'high';
    evidence: string[];
    recommendation: string;
  }>;

  recommendations: string[];

  verification?: {
    status: 'verified' | 'contested' | 'blocked';
    confidence: number;
    unsupportedClaims: string[];
    missingSources: string[];
    contradictions: string[];
    recommendation: 'safe_to_seal' | 'revision_required' | 'block_seal';
    verifiedAt: string;
  };

  canon?: {
    substratePath?: string;
    markdownPath?: string;
    jsonPath?: string;
    sealHash?: string;
    sealedAt?: string;
  };
};
```

## Proposed Files

```txt
lib/agents/weeklyDigest/schema.ts
lib/agents/weeklyDigest/sources.ts
lib/agents/weeklyDigest/eveSynthesize.ts
lib/agents/weeklyDigest/jadeVerify.ts
lib/agents/weeklyDigest/writer.ts

app/api/agents/weekly-digest/route.ts
app/api/terminal/weekly-digest/route.ts

docs/pr-bundles/C-292-weekly-digest-quorum.md
```

## API Design

### GET /api/terminal/weekly-digest

Returns latest weekly digest.

Response:

```json
{
  "ok": true,
  "digest": {},
  "source": "kv",
  "timestamp": "..."
}
```

### POST /api/agents/weekly-digest

Generates a new weekly digest.

Request:

```json
{
  "days": 7,
  "mode": "draft"
}
```

Supported modes:

- draft — EVE synthesis only
- verify — JADE verifies latest EVE draft
- seal — seal already verified digest
- full — EVE synthesis plus JADE verification, no ZEUS seal unless configured

## Storage Plan

### KV

```txt
weekly:digest:latest
weekly:digest:{weekStart}
weekly:digest:draft:{weekStart}
weekly:digest:verification:{weekStart}
```

### Substrate

```txt
digests/weekly/{weekStart}-mobius-weekly-digest.json
digests/weekly/{weekStart}-mobius-weekly-digest.md
digests/weekly/{weekStart}-jade-verification.json
```

Optional ZEUS seal:

```txt
digests/weekly/{weekStart}-zeus-seal.json
```

## Terminal UI Card

```txt
MOBIUS WEEKLY DIGEST
C-285 to C-291

Health: Mixed / Improving
GI: 0.77 to 0.84
Canon: 34 written / 6 pending / 1 failed
Top issue: UI hydration lag
Top improvement: Journal canon outbox
Synthesized by: EVE
Verified by: JADE
Canon Confidence: 94%
Status: Ready to Seal
```

## Todo List

### Phase 1 — Schema and Source Collection

- [ ] Create `lib/agents/weeklyDigest/schema.ts`
- [ ] Define `WeeklyDigest`
- [ ] Define `WeeklyDigestStatus`
- [ ] Define `WeeklyDigestVerification`
- [ ] Create source loader for terminal watermark
- [ ] Create source loader for snapshot-lite
- [ ] Create source loader for full snapshot
- [ ] Create source loader for agent journals
- [ ] Create source loader for EPICON feed
- [ ] Create source loader for ledger feed
- [ ] Create source loader for tripwires
- [ ] Create source loader for canon outbox
- [ ] Create source loader for Substrate journal archive
- [ ] Add safe fallbacks for missing sources

### Phase 2 — EVE Synthesis

- [ ] Create `eveSynthesize.ts`
- [ ] Parse 7-day cycle range
- [ ] Generate weekly headline
- [ ] Generate executive summary
- [ ] Generate cycle-by-cycle summary
- [ ] Extract improvements
- [ ] Extract regressions
- [ ] Extract top anomalies
- [ ] Extract What Mobius learned
- [ ] Generate next 7 recommended actions
- [ ] Mark digest status as `eve_synthesized`

### Phase 3 — JADE Verification

- [ ] Create `jadeVerify.ts`
- [ ] Verify cycle IDs
- [ ] Verify GI values
- [ ] Verify journal counts
- [ ] Verify canon written / pending / failed counts
- [ ] Verify agent activity matrix
- [ ] Verify snapshot freshness
- [ ] Verify watermark freshness
- [ ] Detect unsupported claims
- [ ] Detect contradictions
- [ ] Detect missing sources
- [ ] Produce canon confidence score
- [ ] Mark digest as `jade_verified`, `jade_contested`, or `revision_required`

### Phase 4 — Writer

- [ ] Create `writer.ts`
- [ ] Write draft digest to KV
- [ ] Write verified digest to KV
- [ ] Write latest digest pointer
- [ ] Write JSON digest to Substrate
- [ ] Write Markdown digest to Substrate
- [ ] Write JADE verification report to Substrate
- [ ] Add canon path metadata
- [ ] Add seal hash metadata if ZEUS seal exists

### Phase 5 — API Routes

- [ ] Add `app/api/agents/weekly-digest/route.ts`
- [ ] Support `POST mode=draft`
- [ ] Support `POST mode=verify`
- [ ] Support `POST mode=full`
- [ ] Support `POST mode=seal`
- [ ] Add auth for write operations
- [ ] Add `app/api/terminal/weekly-digest/route.ts`
- [ ] Return latest weekly digest
- [ ] Add `Cache-Control: no-store`

### Phase 6 — UI

- [ ] Add Weekly Digest Terminal card
- [ ] Show digest status
- [ ] Show cycle range
- [ ] Show health summary
- [ ] Show GI delta
- [ ] Show canon counts
- [ ] Show top issue
- [ ] Show top improvement
- [ ] Show EVE synthesized badge
- [ ] Show JADE verified badge
- [ ] Show canon confidence
- [ ] Show seal status
- [ ] Add Open full digest action

### Phase 7 — Optional ZEUS Seal

- [ ] Add ZEUS seal schema
- [ ] Add procedural verification
- [ ] Add seal hash
- [ ] Add final canon seal file
- [ ] Add `canon_sealed` status
- [ ] Display ZEUS seal in UI only when present

## Acceptance Criteria

- [ ] Weekly digest can be generated from the last 7 days of data.
- [ ] EVE produces a structured synthesis.
- [ ] JADE verifies facts and flags unsupported claims.
- [ ] Digest cannot become canonical without JADE verification.
- [ ] Missing data does not break digest generation.
- [ ] Digest writes to KV.
- [ ] Verified digest can write to Substrate.
- [ ] Terminal can fetch latest digest.
- [ ] UI shows digest status and confidence.
- [ ] Digest clearly separates facts, synthesis, and recommendations.

## Non-Goals

- [ ] Do not create a new major agent personality yet.
- [ ] Do not allow EVE to seal its own digest.
- [ ] Do not allow JADE to rewrite EVE's synthesis beyond verification notes.
- [ ] Do not allow the weekly digest to mutate GI, MIC, or ledger facts.
- [ ] Do not auto-open PRs from digest recommendations yet.

## Future Upgrade

Later, add a lightweight non-personality worker:

```txt
PARSER_WORKER
```

Purpose:

- shard large datasets
- normalize data
- reduce EVE and JADE load
- prepare structured facts before synthesis

Hierarchy:

```txt
PARSER_WORKER = splits and normalizes data
EVE = creates meaning
JADE = verifies truth
ZEUS = seals if needed
```

## Canon Motto

> The Mirror speaks.
> The Seal remembers.
> The week becomes canon only when meaning survives verification.
