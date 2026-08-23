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
  filterLabelUpdatesByAvailable,
  findFailOpenWorkflowPatterns,
  laneFromLegacyVerdict,
  laneFromMissingCredential,
  laneFromStepOutcome,
  parseLegacyVerdictJson,
  renderSentinelReviewComment,
  shouldRunSentinelReview,
  validateLegacyVerdictJson,
  SENTINEL_DEGRADED_LABEL,
  SENTINEL_GATEWAY_PROVIDER,
  SENTINEL_PASS_LABEL,
  SENTINEL_SERVICE_CREDENTIAL,
  type ReviewStepOutcome,
  type SentinelLaneResult,
} from '@/lib/governance/sentinelReviewPolicy';

const NOW = '2026-08-23T01:30:00.000Z';

function passLane(reviewer: 'AUREA' | 'ATLAS' | 'EVE'): SentinelLaneResult {
  const models = {
    AUREA: 'openai/gpt-4o-mini',
    ATLAS: 'anthropic/claude-sonnet-4',
    EVE: 'anthropic/claude-sonnet-4',
  };
  return laneFromLegacyVerdict({
    reviewer,
    observedAt: NOW,
    provider: SENTINEL_GATEWAY_PROVIDER,
    model: models[reviewer],
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
      credential: SENTINEL_SERVICE_CREDENTIAL,
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
        provider: SENTINEL_GATEWAY_PROVIDER,
        model: 'anthropic/claude-sonnet-4',
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
        provider: SENTINEL_GATEWAY_PROVIDER,
        model: 'anthropic/claude-sonnet-4',
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
        provider: SENTINEL_GATEWAY_PROVIDER,
        model: 'openai/gpt-4o-mini',
        raw: JSON.stringify({ verdict: 'pass', blocking: [], non_blocking: [], summary: 'advisory only' }),
        reason: 'Primary model unavailable — advisory fallback model',
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
      credential: SENTINEL_SERVICE_CREDENTIAL,
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
      credential: SENTINEL_SERVICE_CREDENTIAL,
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
    assert.match(source, /AGENT_SERVICE_TOKEN/);
    assert.match(source, /openrouter/);
    assert.match(source, /sentinel-openrouter-lane/);
    assert.match(source, /pnpm\/action-setup@v4/);
    assert.match(source, /ignore-scripts/);
    assert.match(source, /trusted-sentinelReviewPolicy/);
    assert.match(source, /Pin aggregation policy to base revision/);
  });

  it('partial required quorum cannot approve when a lane is missing', () => {
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA'), passLane('ATLAS')],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
    assert.match(disposition.blocking.join(' '), /EVE required but missing/);
  });

  it('required NOT_REQUESTED lane blocks approval', () => {
    const eve = laneFromStepOutcome({ kind: 'not_requested', reviewer: 'EVE' }, NOW);
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA'), passLane('ATLAS'), eve],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
    assert.equal(eve.state, 'NOT_REQUESTED');
  });

  it('duplicate reviewer lanes fail coverage and block approval', () => {
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA'), passLane('AUREA'), passLane('ATLAS'), passLane('EVE')],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
    assert.match(disposition.blocking.join(' '), /AUREA has 2 lane outcomes/);
  });

  it('all-shared-provider PASS lanes cannot satisfy independence quorum', () => {
    const sharedPass = (reviewer: 'AUREA' | 'ATLAS' | 'EVE'): SentinelLaneResult =>
      laneFromLegacyVerdict({
        reviewer,
        observedAt: NOW,
        provider: SENTINEL_GATEWAY_PROVIDER,
        model: 'openai/gpt-4o-mini',
        independence: 'shared_provider',
        parsed: { verdict: 'pass', blocking: [], non_blocking: [], summary: `${reviewer} shared` },
      });
    const disposition = aggregateSentinelReview({
      lanes: [sharedPass('AUREA'), sharedPass('ATLAS'), sharedPass('EVE')],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
    assert.match(disposition.blocking.join(' '), /independence\/provider policy not satisfied/);
  });

  it('filterLabelUpdatesByAvailable skips missing repo labels', () => {
    const filtered = filterLabelUpdatesByAvailable({
      updates: { add: [SENTINEL_PASS_LABEL, SENTINEL_DEGRADED_LABEL], remove: [] },
      availableLabels: ['needs-custodian-review'],
    });
    assert.deepEqual(filtered.add, []);
    assert.deepEqual(filtered.skipped, [SENTINEL_PASS_LABEL, SENTINEL_DEGRADED_LABEL]);
  });

  it('empty label registry snapshot must not be used to strip all adds pre-apply', () => {
    const filtered = filterLabelUpdatesByAvailable({
      updates: { add: [SENTINEL_PASS_LABEL], remove: [] },
      availableLabels: [],
    });
    assert.deepEqual(filtered.add, []);
    assert.deepEqual(filtered.skipped, [SENTINEL_PASS_LABEL]);
    // Aggregator skips this filter when availableLabels is empty; apply step validates live labels.
  });

  it('only AUREA passing with full quorum required cannot approve', () => {
    const disposition = aggregateSentinelReview({
      lanes: [passLane('AUREA')],
      requiredReviewers: ['AUREA', 'ATLAS', 'EVE'],
    });
    assert.equal(disposition.approval_eligible, false);
  });

  it('structurally malformed verdict JSON fails closed without throwing', () => {
    assert.equal(validateLegacyVerdictJson({ verdict: 'fail', blocking: 'not-an-array' }), null);
    const eve = laneFromStepOutcome(
      {
        kind: 'legacy_json',
        reviewer: 'EVE',
        provider: SENTINEL_GATEWAY_PROVIDER,
        model: 'anthropic/claude-sonnet-4',
        independence: 'shared_provider',
        raw: JSON.stringify({ verdict: 'fail', blocking: 'civic-risk-finding' }),
      },
      NOW,
    );
    assert.equal(eve.state, 'MALFORMED');
    assert.equal(parseLegacyVerdictJson(JSON.stringify({ verdict: 'fail', blocking: 'x' })), null);
  });

  it('fallback advisory preserves parsed blocking findings in disposition', () => {
    const eve = laneFromStepOutcome(
      {
        kind: 'fallback_json',
        reviewer: 'EVE',
        provider: SENTINEL_GATEWAY_PROVIDER,
        model: 'openai/gpt-4o-mini',
        raw: JSON.stringify({
          verdict: 'fail',
          blocking: ['Potential civic harm in auth bypass'],
          non_blocking: [],
          summary: 'advisory fail',
        }),
        reason: 'Primary model unavailable — advisory fallback model',
      },
      NOW,
    );
    assert.match(eve.blocking.join(' '), /Potential civic harm in auth bypass/);
    assert.match(eve.blocking.join(' '), /not independent quorum/);
  });

  it('buildDispositionFromStepOutcomes integrates step outcomes fail-closed', () => {
    const outcomes: ReviewStepOutcome[] = [
      {
        kind: 'legacy_json',
        reviewer: 'AUREA',
        provider: SENTINEL_GATEWAY_PROVIDER,
        model: 'openai/gpt-4o-mini',
        independence: 'independent',
        raw: JSON.stringify({ verdict: 'pass', blocking: [], non_blocking: [], summary: 'ok' }),
      },
      {
        kind: 'missing_credential',
        reviewer: 'ATLAS',
        credential: SENTINEL_SERVICE_CREDENTIAL,
      },
      {
        kind: 'missing_credential',
        reviewer: 'EVE',
        credential: SENTINEL_SERVICE_CREDENTIAL,
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
