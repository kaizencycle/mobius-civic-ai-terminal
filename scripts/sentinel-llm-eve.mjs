#!/usr/bin/env node
/**
 * EVE civic-risk lane — primary model with advisory fallback (any OpenAI-compatible provider).
 * Fallback is never independent EVE quorum.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { callOpenAiCompatibleChat, resolveSentinelLlmConfig } from './sentinel-llm-config.mjs';

const OUTCOME_FILE = process.env.OUTCOME_FILE ?? '/tmp/sentinel-eve.outcome.json';
const MAX_PROMPT_CHARS = parseInt(process.env.MAX_PROMPT_CHARS ?? '200000', 10);
const REVIEWER = 'EVE';
const DEGRADED_STATUSES = new Set([401, 402, 403, 429, 500, 502, 503, 504]);

function writeOutcome(outcome) {
  writeFileSync(OUTCOME_FILE, JSON.stringify(outcome));
}

function writeHttpError(config, httpStatus) {
  writeOutcome({
    kind: 'http_error',
    reviewer: REVIEWER,
    provider: config.provider,
    model: config.model || 'unknown',
    independence: 'shared_provider',
    httpStatus: httpStatus ?? 503,
  });
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

async function writeLegacyFromResponse(res, config) {
  const data = await res.json();
  const text = stripJsonFence(data?.choices?.[0]?.message?.content ?? '');
  writeOutcome({
    kind: 'legacy_json',
    reviewer: REVIEWER,
    provider: config.provider,
    model: config.model,
    independence: 'shared_provider',
    raw: text,
  });
}

async function writeFallbackFromResponse(res, config, reason) {
  const data = await res.json();
  const text = stripJsonFence(data?.choices?.[0]?.message?.content ?? '');
  writeOutcome({
    kind: 'fallback_json',
    reviewer: REVIEWER,
    provider: config.provider,
    model: config.model,
    raw: text,
    reason,
  });
}

async function tryFallback(userContent, systemPrompt, reason) {
  const fallbackConfig = resolveSentinelLlmConfig(REVIEWER, {
    modelEnv: 'SENTINEL_EVE_FALLBACK_MODEL',
    role: 'fallback',
  });

  if (!fallbackConfig.model) return false;

  if (!fallbackConfig.apiKey) {
    writeHttpError(fallbackConfig, 503);
    return true;
  }

  try {
    const fallbackRes = await callOpenAiCompatibleChat(fallbackConfig, [
      {
        role: 'system',
        content:
          'You are an advisory fallback for EVE civic-risk review. Return STRICT JSON only. This is NOT independent EVE attestation.',
      },
      { role: 'user', content: userContent },
    ]);
    if (fallbackRes.ok) {
      await writeFallbackFromResponse(fallbackRes, fallbackConfig, reason);
      return true;
    }
    writeHttpError(fallbackConfig, fallbackRes.status);
    return true;
  } catch {
    writeHttpError(fallbackConfig, 503);
    return true;
  }
}

async function main() {
  const primaryConfig = resolveSentinelLlmConfig(REVIEWER, {
    modelEnv: 'SENTINEL_EVE_MODEL',
    role: 'primary',
  });
  const fallbackConfig = resolveSentinelLlmConfig(REVIEWER, {
    modelEnv: 'SENTINEL_EVE_FALLBACK_MODEL',
    role: 'fallback',
  });

  if (!primaryConfig.model && !fallbackConfig.model) {
    writeOutcome({
      kind: 'missing_credential',
      reviewer: REVIEWER,
      credential: 'SENTINEL_EVE_MODEL|SENTINEL_EVE_FALLBACK_MODEL',
    });
    return;
  }

  if (!primaryConfig.apiKey && !fallbackConfig.apiKey) {
    writeOutcome({
      kind: 'missing_credential',
      reviewer: REVIEWER,
      credential: primaryConfig.credentialHint,
    });
    return;
  }

  const userContent = buildPrompt();
  const systemPrompt = 'You are EVE. Return STRICT JSON only.';

  try {
    if (primaryConfig.model) {
      if (!primaryConfig.apiKey) {
        const handled = await tryFallback(
          userContent,
          systemPrompt,
          'Primary API key missing — advisory fallback model (not independent EVE quorum)',
        );
        if (!handled) writeHttpError(primaryConfig, 503);
        return;
      }

      let primaryRes = null;
      let primaryTransportError = false;

      try {
        primaryRes = await callOpenAiCompatibleChat(primaryConfig, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ]);
      } catch {
        primaryTransportError = true;
      }

      if (primaryTransportError) {
        const handled = await tryFallback(
          userContent,
          systemPrompt,
          'Primary model transport failure — advisory fallback model (not independent EVE quorum)',
        );
        if (!handled) writeHttpError(primaryConfig, 503);
        return;
      }

      if (primaryRes.ok) {
        await writeLegacyFromResponse(primaryRes, primaryConfig);
        return;
      }

      const primaryStatus = primaryRes.status;
      if (DEGRADED_STATUSES.has(primaryStatus)) {
        const handled = await tryFallback(
          userContent,
          systemPrompt,
          'Primary model unavailable — advisory fallback model (not independent EVE quorum)',
        );
        if (!handled) writeHttpError(primaryConfig, primaryStatus);
        return;
      }

      writeHttpError(primaryConfig, primaryStatus);
      return;
    }

    if (fallbackConfig.model) {
      const handled = await tryFallback(
        userContent,
        systemPrompt,
        'Primary model not configured — advisory fallback only (not independent EVE quorum)',
      );
      if (!handled) writeHttpError(fallbackConfig, 503);
      return;
    }

    writeHttpError(primaryConfig, 503);
  } catch {
    writeHttpError(primaryConfig, 503);
  }
}

main();
