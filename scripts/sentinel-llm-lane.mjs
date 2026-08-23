#!/usr/bin/env node
/**
 * Run one Sentinel Review lane via any OpenAI-compatible LLM endpoint.
 *
 * Required env:
 *   REVIEWER — AUREA | ATLAS
 *   SENTINEL_MODEL — model id for this lane
 *   SENTINEL_INDEPENDENCE — independent | shared_provider
 *   OUTCOME_FILE — path to write ReviewStepOutcome JSON
 *
 * Per-lane credentials (any one suffices):
 *   SENTINEL_{REVIEWER}_API_KEY, AGENT_SERVICE_TOKEN, LLM_API_KEY, OPENAI_API_KEY
 *
 * Optional per-lane:
 *   SENTINEL_{REVIEWER}_BASE_URL, LLM_BASE_URL, OPENROUTER_BASE_URL
 *   SENTINEL_{REVIEWER}_PROVIDER — disposition label (auto-inferred from base URL if omitted)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { callOpenAiCompatibleChat, resolveSentinelLlmConfig } from './sentinel-llm-config.mjs';

const REVIEWER = (process.env.REVIEWER ?? '').toUpperCase();
const INDEPENDENCE = process.env.SENTINEL_INDEPENDENCE ?? 'shared_provider';
const OUTCOME_FILE = process.env.OUTCOME_FILE ?? '';
const MAX_PROMPT_CHARS = parseInt(process.env.MAX_PROMPT_CHARS ?? '200000', 10);

const REVIEWER_ROLES = {
  AUREA: {
    name: 'AUREA',
    role: 'a civic integrity reviewer for the Mobius Civic AI Terminal',
    extra: 'Only "fail" when at least one blocking item exists. Cite file paths.',
  },
  ATLAS: {
    name: 'ATLAS',
    role: 'the primary sentinel of the Mobius Civic AI Terminal',
    extra: 'Only "fail" when at least one blocking item exists. Cite file paths.',
  },
};

function writeOutcome(outcome) {
  if (!OUTCOME_FILE) throw new Error('OUTCOME_FILE not set');
  writeFileSync(OUTCOME_FILE, JSON.stringify(outcome));
}

function stripJsonFence(text) {
  let t = text.trim();
  if (t.startsWith('```json')) t = t.slice(7);
  if (t.startsWith('```')) t = t.slice(3);
  if (t.endsWith('```')) t = t.slice(0, -3);
  return t.trim();
}

function buildPrompt(reviewerKey) {
  const spec = REVIEWER_ROLES[reviewerKey];
  if (!spec) throw new Error(`Unsupported reviewer for lane script: ${reviewerKey}`);

  const meta = readFileSync('/tmp/pr.meta.json', 'utf8');
  const diff = readFileSync('/tmp/pr.diff', 'utf8');
  const files = readFileSync('/tmp/changed_files.txt', 'utf8');

  const instruction = `
You are ${spec.name}, ${spec.role}.
Return ONLY valid JSON (no markdown):
{"verdict":"pass"|"fail","summary":"string","blocking":["..."],"non_blocking":["..."]}
${spec.extra}
`;

  const content = `# ${spec.name} Review\n## PR Meta\n${meta}\n## Changed files\n${files}\n## Diff\n${diff}\n${instruction}`;
  return content.length > MAX_PROMPT_CHARS ? content.slice(0, MAX_PROMPT_CHARS) + '\n[TRUNCATED]' : content;
}

async function main() {
  if (!['AUREA', 'ATLAS'].includes(REVIEWER)) {
    throw new Error(`sentinel-llm-lane.mjs supports AUREA|ATLAS only; got ${REVIEWER}`);
  }

  const config = resolveSentinelLlmConfig(REVIEWER, { modelEnv: 'SENTINEL_MODEL' });

  if (!config.model) {
    writeOutcome({ kind: 'missing_credential', reviewer: REVIEWER, credential: config.modelEnv });
    return;
  }

  if (!config.apiKey) {
    writeOutcome({ kind: 'missing_credential', reviewer: REVIEWER, credential: config.credentialHint });
    return;
  }

  try {
    const userContent = buildPrompt(REVIEWER);
    const systemPrompt = `You are ${REVIEWER}. Return STRICT JSON only.`;

    const res = await callOpenAiCompatibleChat(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]);

    if (!res.ok) {
      writeOutcome({
        kind: 'http_error',
        reviewer: REVIEWER,
        provider: config.provider,
        model: config.model,
        independence: INDEPENDENCE,
        httpStatus: res.status,
      });
      return;
    }

    const data = await res.json();
    const text = stripJsonFence(data?.choices?.[0]?.message?.content ?? '');

    writeOutcome({
      kind: 'legacy_json',
      reviewer: REVIEWER,
      provider: config.provider,
      model: config.model,
      independence: INDEPENDENCE,
      raw: text,
    });
  } catch {
    writeOutcome({
      kind: 'http_error',
      reviewer: REVIEWER,
      provider: config.provider,
      model: config.model || 'unknown',
      independence: INDEPENDENCE,
      httpStatus: 503,
    });
  }
}

main();
