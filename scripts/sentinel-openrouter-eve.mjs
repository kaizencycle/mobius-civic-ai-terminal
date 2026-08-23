#!/usr/bin/env node
/**
 * EVE civic-risk lane via OpenRouter — primary model with advisory fallback model.
 * Same gateway (AGENT_SERVICE_TOKEN); fallback is never independent EVE quorum.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const PRIMARY_MODEL = process.env.SENTINEL_EVE_MODEL ?? '';
const FALLBACK_MODEL = process.env.SENTINEL_EVE_FALLBACK_MODEL ?? '';
const OUTCOME_FILE = process.env.OUTCOME_FILE ?? '/tmp/sentinel-eve.outcome.json';
const API_KEY = (process.env.AGENT_SERVICE_TOKEN ?? '').trim();
const BASE_URL = (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const MAX_PROMPT_CHARS = parseInt(process.env.MAX_PROMPT_CHARS ?? '200000', 10);
const PROVIDER = 'openrouter';
const REVIEWER = 'EVE';
const DEGRADED_STATUSES = new Set([401, 402, 403, 429, 500, 502, 503, 504]);

function writeOutcome(outcome) {
  writeFileSync(OUTCOME_FILE, JSON.stringify(outcome));
}

function stripJsonFence(text) {
  let t = text.trim();
  if (t.startsWith('```json')) t = t.slice(7);
  if (t.startsWith('```')) t = t.slice(3);
  if (t.endsWith('```')) t = t.slice(0, -3);
  return t.trim();
}

function buildPrompt() {
  const meta = readFileSync('/tmp/pr.meta.json', 'utf8');
  const diff = readFileSync('/tmp/pr.diff', 'utf8');
  const files = readFileSync('/tmp/changed_files.txt', 'utf8');

  const instruction = `
You are EVE, the civic-risk and ethics reviewer for the Mobius Civic AI Terminal.
Return ONLY valid JSON (no markdown):
{"verdict":"pass"|"fail","summary":"string","blocking":["..."],"non_blocking":["..."]}
Never silently approve high-risk civic harm. Only "fail" when at least one blocking item exists.
`;

  const content = `# EVE Review\n## PR Meta\n${meta}\n## Changed files\n${files}\n## Diff\n${diff}\n${instruction}`;
  return content.length > MAX_PROMPT_CHARS ? content.slice(0, MAX_PROMPT_CHARS) + '\n[TRUNCATED]' : content;
}

async function callOpenRouter(model, systemPrompt, userContent, advisory = false) {
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
        {
          role: 'system',
          content: advisory
            ? 'You are an advisory fallback for EVE civic-risk review. Return STRICT JSON only. This is NOT independent EVE attestation.'
            : systemPrompt,
        },
        { role: 'user', content: userContent },
      ],
    }),
  });

  return res;
}

async function writeFallbackFromResponse(res, model, reason) {
  const data = await res.json();
  const text = stripJsonFence(data?.choices?.[0]?.message?.content ?? '');
  writeOutcome({
    kind: 'fallback_json',
    reviewer: REVIEWER,
    provider: PROVIDER,
    model,
    raw: text,
    reason,
  });
}

async function main() {
  if (!PRIMARY_MODEL && !FALLBACK_MODEL) {
    writeOutcome({ kind: 'missing_credential', reviewer: REVIEWER, credential: 'SENTINEL_EVE_MODEL' });
    return;
  }

  if (!API_KEY) {
    writeOutcome({ kind: 'missing_credential', reviewer: REVIEWER, credential: 'AGENT_SERVICE_TOKEN' });
    return;
  }

  const userContent = buildPrompt();
  const systemPrompt = 'You are EVE. Return STRICT JSON only.';

  try {
    let primaryTransportError = null;
    let primaryAttempt = null;

    if (PRIMARY_MODEL) {
      try {
        primaryAttempt = await callOpenRouter(PRIMARY_MODEL, systemPrompt, userContent);
      } catch {
        primaryTransportError = true;
      }

      const shouldFallback =
        primaryTransportError ||
        (primaryAttempt && !primaryAttempt.ok && DEGRADED_STATUSES.has(primaryAttempt.status));

      if (shouldFallback && FALLBACK_MODEL) {
        const reason = primaryTransportError
          ? 'Primary model transport failure — advisory fallback model (not independent EVE quorum)'
          : 'Primary model unavailable — advisory fallback model (not independent EVE quorum)';

        try {
          const fallbackRes = await callOpenRouter(FALLBACK_MODEL, systemPrompt, userContent, true);
          if (fallbackRes.ok) {
            await writeFallbackFromResponse(fallbackRes, FALLBACK_MODEL, reason);
            return;
          }
          primaryAttempt = fallbackRes;
        } catch {
          writeOutcome({
            kind: 'http_error',
            reviewer: REVIEWER,
            provider: PROVIDER,
            model: FALLBACK_MODEL,
            independence: 'shared_provider',
            httpStatus: 503,
          });
          return;
        }
      } else if (primaryTransportError) {
        writeOutcome({
          kind: 'http_error',
          reviewer: REVIEWER,
          provider: PROVIDER,
          model: PRIMARY_MODEL,
          independence: 'shared_provider',
          httpStatus: 503,
        });
        return;
      }

      if (primaryAttempt?.ok) {
        const data = await primaryAttempt.json();
        const text = stripJsonFence(data?.choices?.[0]?.message?.content ?? '');
        writeOutcome({
          kind: 'legacy_json',
          reviewer: REVIEWER,
          provider: PROVIDER,
          model: PRIMARY_MODEL,
          independence: 'shared_provider',
          raw: text,
        });
        return;
      }

      if (!FALLBACK_MODEL) {
        writeOutcome({
          kind: 'http_error',
          reviewer: REVIEWER,
          provider: PROVIDER,
          model: PRIMARY_MODEL,
          independence: 'shared_provider',
          httpStatus: primaryAttempt?.status ?? 503,
        });
        return;
      }
    }

    if (FALLBACK_MODEL && !PRIMARY_MODEL) {
      try {
        const fallbackRes = await callOpenRouter(FALLBACK_MODEL, systemPrompt, userContent, true);
        if (fallbackRes.ok) {
          await writeFallbackFromResponse(
            fallbackRes,
            FALLBACK_MODEL,
            'Primary model not configured — advisory fallback only (not independent EVE quorum)',
          );
          return;
        }
        writeOutcome({
          kind: 'http_error',
          reviewer: REVIEWER,
          provider: PROVIDER,
          model: FALLBACK_MODEL,
          independence: 'shared_provider',
          httpStatus: fallbackRes.status,
        });
      } catch {
        writeOutcome({
          kind: 'http_error',
          reviewer: REVIEWER,
          provider: PROVIDER,
          model: FALLBACK_MODEL,
          independence: 'shared_provider',
          httpStatus: 503,
        });
      }
    }
  } catch {
    writeOutcome({
      kind: 'http_error',
      reviewer: REVIEWER,
      provider: PROVIDER,
      model: PRIMARY_MODEL || FALLBACK_MODEL || 'unknown',
      independence: 'shared_provider',
      httpStatus: 503,
    });
  }
}

main();
