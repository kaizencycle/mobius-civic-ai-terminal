/**
 * Sentinel Review disposition aggregator — invoked from sentinel-review.yml.
 * Imports policy from SENTINEL_POLICY_PATH (trusted base revision or PR bootstrap).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const policyPath = resolve(
  process.env.SENTINEL_POLICY_PATH || './lib/governance/sentinelReviewPolicy.ts',
);
const imported = await import(pathToFileURL(policyPath).href);
const policy = (imported as { default?: Record<string, unknown> }).default ?? imported;

const buildDispositionFromStepOutcomes = policy.buildDispositionFromStepOutcomes as (args: {
  labels: string[];
  outcomes: unknown[];
  observedAt: string;
}) => Record<string, unknown>;
const computeLabelUpdates = policy.computeLabelUpdates as (args: {
  disposition: Record<string, unknown>;
  currentLabels: string[];
}) => { add: string[]; remove: string[] };
const filterLabelUpdatesByAvailable = policy.filterLabelUpdatesByAvailable as
  | ((args: {
      updates: { add: string[]; remove: string[] };
      availableLabels: string[];
    }) => { add: string[]; remove: string[]; skipped: string[] })
  | undefined;
const renderSentinelReviewComment = policy.renderSentinelReviewComment as (
  disposition: Record<string, unknown>,
) => string;

if (typeof buildDispositionFromStepOutcomes !== 'function') {
  throw new Error(`Policy at ${policyPath} lacks buildDispositionFromStepOutcomes`);
}

const labels = (process.env.PR_LABELS || '').split(',').map((s) => s.trim()).filter(Boolean);
const availableLabels = (process.env.REPO_LABELS || '').split(',').map((s) => s.trim()).filter(Boolean);
const observedAt = new Date().toISOString();
const paths = [
  '/tmp/sentinel-aurea.outcome.json',
  '/tmp/sentinel-atlas.outcome.json',
  '/tmp/sentinel-eve.outcome.json',
];
const outcomes = paths.map((path) => JSON.parse(readFileSync(path, 'utf8')));
const disposition = buildDispositionFromStepOutcomes({ labels, outcomes, observedAt });
const rawLabelUpdates = computeLabelUpdates({
  disposition,
  currentLabels: labels,
});
const labelUpdates = filterLabelUpdatesByAvailable
  ? filterLabelUpdatesByAvailable({ updates: rawLabelUpdates, availableLabels })
  : { add: rawLabelUpdates.add, remove: rawLabelUpdates.remove, skipped: [] as string[] };
let comment = renderSentinelReviewComment(disposition);
if (labelUpdates.skipped?.length) {
  comment += `\n\n> ⚠️ **Label configuration:** skipped missing repo labels: ${labelUpdates.skipped.join(', ')}. Provision \`consensus:approved\` and \`review:degraded\` before relying on label mutations.\n`;
}
writeFileSync('/tmp/sentinel-disposition.json', JSON.stringify(disposition, null, 2));
writeFileSync('/tmp/sentinel-comment.md', comment);
writeFileSync(
  '/tmp/sentinel-label-updates.json',
  JSON.stringify({ add: labelUpdates.add, remove: labelUpdates.remove }, null, 2),
);
console.log(`approval_eligible=${(disposition as { approval_eligible: boolean }).approval_eligible}`);
