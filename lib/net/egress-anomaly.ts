/**
 * lib/net/egress-anomaly.ts — C-442 Agent Egress Observability (ZEUS deliverable).
 *
 * Classifies a NET_EGRESS receipt against the anomaly ladder from the C-442
 * handoff. This is a pure, read-only classifier: it labels, it never denies,
 * blocks, or delays. Enforcement (actually acting on LEVEL 3+) is explicitly
 * out of scope for this PR — see docs/epicon/cycles/C-442.
 *
 * LEVEL 0 NORMAL         — known actor, known destination, expected method, valid authority.
 * LEVEL 1 UNKNOWN        — request cannot be attributed cleanly (actor/trigger unresolved).
 * LEVEL 2 UNEXPECTED     — destination outside the expected graph (not in the authority matrix).
 * LEVEL 3 AUTHORITY      — request conflicts with an explicit policy (method not allowed for a known host).
 *                          VIOLATION   Observe-only here: flagged, not denied (no enforcement exists yet).
 * LEVEL 4 CIRCUMVENTION  — not derivable from a single receipt; requires a paired
 *                          denial + retry sequence. Left as a documented next step
 *                          (see "Not done in this PR").
 * LEVEL 5 PROPAGATION    — not derivable from a single receipt; requires cross-run/
 *                          cross-agent correlation. Left as a documented next step.
 *
 * A classification of LEVEL 2+ is never itself "the agent escaped," "emergence,"
 * or "misalignment." It is "provenance review required."
 *
 * Method-authority (LEVEL 3) is checked independently of attribution: an
 * unattributed call site (actor SYSTEM / trigger unknown) must not mask a
 * disallowed method against a *known* host — those are orthogonal facts,
 * and a real authority violation on a known destination is worth flagging
 * even when nothing wrapped that call site with withEgressContext yet.
 */

import type { NetEgressReceipt } from './egress-core';
import { EGRESS_AUTHORITY_MATRIX, type EgressAuthorityEntry } from './egress-authority';

export type AnomalyLevel = 0 | 1 | 2 | 3;

export interface EgressAnomalyClassification {
  level: AnomalyLevel;
  label: string;
  matched_entry: EgressAuthorityEntry | null;
}

/**
 * Matches a host against the authority matrix. Only an exact host match or a
 * proper subdomain (`sub.example.com` against `example.com`) counts — a bare
 * suffix match (`notexample.com` ending in `example.com`) is deliberately
 * NOT accepted, since it would false-match unrelated lookalike domains.
 */
export function findAuthorityEntry(host: string): EgressAuthorityEntry | null {
  const lower = host.toLowerCase();
  return (
    EGRESS_AUTHORITY_MATRIX.find((entry) => {
      if (entry.host.startsWith('*.')) return lower.endsWith(entry.host.slice(1));
      return lower === entry.host || lower.endsWith(`.${entry.host}`);
    }) ?? null
  );
}

/**
 * Classifies a receipt independently of what the caller *claimed* its own
 * expected_destination to be — ZEUS re-evaluates against the matrix rather
 * than trusting the emitting code's self-report (EPICON-02 divergence
 * posture: divergence is a state condition, not an accusation, but it is
 * always observed, not self-certified).
 */
export function classifyEgress(receipt: NetEgressReceipt): EgressAnomalyClassification {
  const matched = findAuthorityEntry(receipt.destination_host);

  if (!matched) {
    return {
      level: 2,
      label: 'UNEXPECTED DESTINATION — not in the known authority graph. Provenance review required, not automatically anomalous.',
      matched_entry: null,
    };
  }

  if (!matched.methods.includes(receipt.method)) {
    return {
      level: 3,
      label: `AUTHORITY MISMATCH — ${receipt.method} to ${receipt.destination_host} is outside the declared method set [${matched.methods.join(', ')}] for authority ${matched.authority}. Flagged, not denied — no enforcement exists yet.`,
      matched_entry: matched,
    };
  }

  if (receipt.actor === 'SYSTEM' && receipt.trigger === 'unknown') {
    // Known destination, expected method, but this receipt carries no
    // attribution context — most of the codebase is not yet wired with
    // withEgressContext (v1 scope). Honest LEVEL 1, not a false LEVEL 0.
    return {
      level: 1,
      label: 'UNKNOWN ATTRIBUTION — destination is known/expected, but actor/trigger were not captured for this call site.',
      matched_entry: matched,
    };
  }

  return {
    level: 0,
    label: `NORMAL — ${receipt.destination_host} matches authority ${matched.authority}.`,
    matched_entry: matched,
  };
}

/** Resolves the `authority`/`authority_scope`/`expected_destination` fields for a receipt-in-progress. */
export function resolveAuthorityFields(host: string): {
  authority: string;
  authority_scope: string;
  expected_destination: boolean;
} {
  const matched = findAuthorityEntry(host);
  if (!matched) {
    return { authority: 'UNRESOLVED', authority_scope: 'unclassified', expected_destination: false };
  }
  return {
    authority: matched.authority,
    authority_scope: matched.methods.join('|'),
    expected_destination: true,
  };
}

/**
 * Emits a separate, greppable EGRESS_ANOMALY log line for LEVEL >= 2, per the
 * C-442 handoff's "Generate EGRESS_ANOMALY and preserve the evidence for
 * human review." LEVEL 0/1 are recorded only as the underlying NET_EGRESS
 * receipt — they are not anomalies.
 */
export function recordAnomalyIfNeeded(receipt: NetEgressReceipt, classification: EgressAnomalyClassification): void {
  if (classification.level < 2) return;
  // eslint-disable-next-line no-console
  console.log(
    `EGRESS_ANOMALY ${JSON.stringify({
      event: 'EGRESS_ANOMALY',
      level: classification.level,
      label: classification.label,
      receipt,
    })}`
  );
}
