#!/usr/bin/env node
/**
 * Run one Sentinel Review lane via OpenRouter (model-agnostic gateway).
 * Invoked from sentinel-review.yml with AGENT_SERVICE_TOKEN scoped per step.
 *
 * Required env:
 *   REVIEWER — AUREA | ATLAS | EVE (EVE uses sentinel-openrouter-eve.mjs)
 *   SENTINEL_MODEL — OpenRouter model id (e.g. openai/gpt-4o-mini)
 *   SENTINEL_INDEPENDENCE — independent | shared_provider
 *   OUTCOME_FILE — path to write ReviewStepOutcome JSON
 *
 * Optional:
 *   AGENT_SERVICE_TOKEN — OpenRouter API key (GitHub secret)
 *   OPENROUTER_BASE_URL — default https://openrouter.ai/api/v1
 *   MAX_PROMPT_CHARS — default 200000
 *   GITHUB_REPOSITORY — for OpenRouter attribution headers
 */

import { readFileSync, writeFileSync } from 'node:fs';

const REVIEWER = process.env.REVIEWER ?? '';
const MODEL = process.env.SENTINEL_MODEL ?? '';
const INDEPENDENCE = process.env.SENTINEL_INDEPENDENCE ?? 'shared_provider';
const OUTCOME_FILE = process.env.OUTCOME_FILE ?? '';
const API_KEY = (process.env.AGENT_SERVICE_TOKEN ?? '').trim();
const BASE_URL = (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const MAX_PROMPT_CHARS = parseInt(process.env.MAX_PROMPT_CHARS ?? '200000', 10);
const PROVIDER = 'openrouter';

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

async function callOpenRouter(model, systemPrompt, userContent) {
  const repo = process.env.GITHUB_REPOSITORY ?? 'kaizencycle/mobius-civic-ai-terminal';
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': `https://github.com/${repo}`,
    'X-Title': 'Mobius Sentinel Review',
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  return res;
}

async function main() {
  const reviewer = REVIEWER.toUpperCase();
  if (!['AUREA', 'ATLAS'].includes(reviewer)) {
    throw new Error(`sentinel-openrouter-lane.mjs supports AUREA|ATLAS only; got ${REVIEWER}`);
  }
  if (!MODEL) {
    writeOutcome({ kind: 'missing_credential', reviewer, credential: 'SENTINEL_MODEL' });
    return;
  }

  try {
    if (!API_KEY) {
      writeOutcome({ kind: 'missing_credential', reviewer, credential: 'AGENT_SERVICE_TOKEN' });
      return;
    }

    const userContent = buildPrompt(reviewer);
    const systemPrompt = `You are ${reviewer}. Return STRICT JSON only.`;

    const res = await callOpenRouter(MODEL, systemPrompt, userContent);

    if (!res.ok) {
      writeOutcome({
        kind: 'http_error',
        reviewer,
        provider: PROVIDER,
        model: MODEL,
        independence: INDEPENDENCE,
        httpStatus: res.status,
      });
      return;
    }

    const data = await res.json();
    const text = stripJsonFence(data?.choices?.[0]?.message?.content ?? '');

    writeOutcome({
      kind: 'legacy_json',
      reviewer,
      provider: PROVIDER,
      model: MODEL,
      independence: INDEPENDENCE,
      raw: text,
    });
  } catch {
    writeOutcome({
      kind: 'http_error',
      reviewer,
      provider: PROVIDER,
      model: MODEL || 'unknown',
      independence: INDEPENDENCE,
      httpStatus: 503,
    });
  }
}

main();
