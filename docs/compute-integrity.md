# Compute Integrity — C-298

## InferenceRecord

```ts
export type InferenceRecord = {
  model: string;
  location: 'local' | 'cloud';
  latency_ms: number;
  cost: number;
  confidence: number;
  verified: boolean;
};
```

## Compute Integrity Score (CIS)

CIS = verified_outputs / total_outputs

## Rules

Unverified inference is not truth.
Only verified outputs may enter the Ledger or influence Global Integrity.

## Phase 1 Boundary

C-298 Phase 1 does not persist InferenceRecords yet. It only prepares the schema and routing contract.
