// C-411 JOB-4: Sentinel Review degraded-state routing for EVE governance lane
// Run: tsx tests/contract/sentinelReviewDegradedRouting.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aggregateSentinelReview,
  buildDispositionFromStepOutcomes,
  computeLabelUpdates,
  determineRequiredReviewers,
  findFailOpenWorkflowPatterns,
  laneFromLegacyVerdict,
  laneFromMissingCredential,
  laneFromStepOutcome,
  renderSentinelReviewComment,
  shouldRunSentinelReview,
  SENTINEL_DEGRADED_LABEL,
  SENTINEL_PASS_LABEL,
  type ReviewStepOutcome,
  type SentinelLaneResult,
} from '@/lib/governance/sentinelReviewPolicy';

const NOW = '2026-08-23T01:30:00.000Z';

function passLane(reviewer: 'AUREA' | 'ATLAS' | 'EVE'): SentinelLaneResult {
  return laneFromLegacyVerdict({
    reviewer,
    observedAt: NOW,
    provider: reviewer === 'AUREA' ? 'openai' : 'anthropic',
    model: reviewer === 'AUREA' ? 'gpt-4o-mini' : 'claude-sonnet-4-20250514',
    independence: reviewer === 'AUREA' ? 'independent' : 'shared_provider',
    parsed: { verdict: 'pass', blocking: [], non_blocking: [], summary: `${reviewer} ok` },
  });
}

describe('Sentinel Review degraded routing (C-411 JOB-4)', () => {
  it('all required independent lanes pass → approval eligible', () => {
    const lanes = [passLane('AUREA'), passLane('ATLAS'), passLane('EVE')];
    const disposition = aggregateSentinelReview({
      lanes,
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, true);
    assert.equal(disposition.consensus_approved, true);
    assert.equal(disposition.overall, 'PASS');
  });

  it('EVE credential missing → degraded, routed to ZEUS/human, approval ineligible', () => {
    const eve = laneFromMissingCredential({
      reviewer: 'EVE',
      observedAt: NOW,
      credential: 'ANTHROPIC_API_KEY|OPENAI_API_KEY',
    });
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA'), passLane('ATLAS'), eve],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
    assert.match(disposition.routing_disposition.join(','), /ZEUS/);
    assert.match(disposition.routing_disposition.join(','), /HUMAN/);
    assert.equal(disposition.overall, 'DEGRADED');
  });

  it('EVE HTTP credit/rate failure → degraded, approval ineligible', () => {
    const eve = laneFromStepOutcome(
      {
        kind: 'http_error',
        reviewer: 'EVE',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        independence: 'shared_provider',
        httpStatus: 402,
      },
      NOW,
    );
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA'), passLane('ATLAS'), eve],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
    assert.equal(eve.state, 'DEGRADED_UNAVAILABLE');
  });

  it('EVE malformed or empty output → malformed/fail-closed, approval ineligible', () => {
    const eve = laneFromStepOutcome(
      {
        kind: 'legacy_json',
        reviewer: 'EVE',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        independence: 'shared_provider',
        raw: '',
      },
      NOW,
    );
    assert.equal(eve.state, 'MALFORMED');
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA'), passLane('ATLAS'), eve],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
  });

  it('shared-provider fallback returns advice → visible as fallback, not independent quorum', () => {
    const eve = laneFromStepOutcome(
      {
        kind: 'fallback_json',
        reviewer: 'EVE',
        provider: 'openai',
        model: 'gpt-4o-mini',
        raw: JSON.stringify({ verdict: 'pass', blocking: [], non_blocking: [], summary: 'advisory only' }),
        reason: 'Anthropic unavailable — OpenAI advisory fallback',
      },
      NOW,
    );
    assert.equal(eve.state, 'DEGRADED_FALLBACK');
    assert.equal(eve.independence, 'shared_provider');
    const comment = renderSentinelReviewComment(
      aggregateSentinelReview({
        lanes: [passLane('AUREA'), passLane('ATLAS'), eve],
        requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
      }),
    );
    assert.match(comment, /DEGRADED_FALLBACK/);
    assert.match(comment, /never counts as independent EVE approval/i);
  });

  it('AUREA or ATLAS missing credential → not converted to pass', () => {
    const aurea = laneFromMissingCredential({
      reviewer: 'AUREA',
      observedAt: NOW,
      credential: 'OPENAI_API_KEY',
    });
    assert.notEqual(aurea.state, 'PASS');
    const disposition = aggregateSentinelReview({
      lanes: [aurea, passLane('ATLAS'), passLane('EVE')],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
  });

  it('empty aggregator input → not pass', () => {
    const disposition = aggregateSentinelReview({ lanes: [], requiredReviewers: ['AUREA', 'ATLAS', 'EVE'] });
    assert.equal(disposition.approval_eligible, false);
    assert.notEqual(disposition.overall, 'PASS');
  });

  it('PR with needs-custodian-review triggers review instead of vacuous skip', () => {
    const gate = shouldRunSentinelReview(['needs-custodian-review']);
    assert.equal(gate.run, true);
    assert.deepEqual(determineRequiredReviewers(['needs-custodian-review']), ['AUREA', 'ATLAS', 'EVE']);
  });

  it('re-running produces stable idempotent label updates', () => {
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA'), passLane('ATLAS'), passLane('EVE')],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    const first = computeLabelUpdates({ disposition, currentLabels: ['needs-custodian-review'] });
    const second = computeLabelUpdates({
      disposition,
      currentLabels: ['needs-custodian-review', SENTINEL_PASS_LABEL],
    });
    assert.deepEqual(first.add, [SENTINEL_PASS_LABEL]);
    assert.deepEqual(first.remove, []);
    assert.deepEqual(second.add, []);
    assert.deepEqual(second.remove, []);
  });

  it('degraded EVE adds review:degraded and preserves custodian routing labels', () => {
    const eve = laneFromMissingCredential({
      reviewer: 'EVE',
      observedAt: NOW,
      credential: 'ANTHROPIC_API_KEY',
    });
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA'), passLane('ATLAS'), eve],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    const updates = computeLabelUpdates({ disposition, currentLabels: [] });
    assert.ok(updates.add.includes(SENTINEL_DEGRADED_LABEL));
    assert.ok(updates.add.includes('needs-custodian-review'));
    assert.ok(!updates.add.includes(SENTINEL_PASS_LABEL));
  });

  it('workflow source no longer contains missing-secret pass defaults', () => {
    const source = readFileSync(join(process.cwd(), '.github/workflows/sentinel-review.yml'), 'utf8');
    const failOpen = findFailOpenWorkflowPatterns(source);
    assert.deepEqual(failOpen, []);
    assert.match(source, /needs-custodian-review/);
    assert.match(source, /sentinelReviewPolicy/);
    assert.match(source, /Run EVE review/);
  });

  it('buildDispositionFromStepOutcomes integrates step outcomes fail-closed', () => {
    const outcomes: ReviewStepOutcome[] = [
      {
        kind: 'legacy_json',
        reviewer: 'AUREA',
        provider: 'openai',
        model: 'gpt-4o-mini',
        independence: 'independent',
        raw: JSON.stringify({ verdict: 'pass', blocking: [], non_blocking: [], summary: 'ok' }),
      },
      {
        kind: 'missing_credential',
        reviewer: 'ATLAS',
        credential: 'ANTHROPIC_API_KEY',
      },
      {
        kind: 'missing_credential',
        reviewer: 'EVE',
        credential: 'ANTHROPIC_API_KEY|OPENAI_API_KEY',
      },
    ];
    const disposition = buildDispositionFromStepOutcomes({
      labels: ['needs-custodian-review'],
      outcomes,
      observedAt: NOW,
    });
    assert.equal(disposition.approval_eligible, false);
    assert.match(disposition.summary, /degraded|failed|blocking/i);
  });
});
