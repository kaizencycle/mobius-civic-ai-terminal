/**
 * Per-lane LLM configuration for Sentinel Review (OpenAI-compatible chat/completions).
 *
 * Each reviewer may supply its own API key, base URL, model, and provider label.
 * Fallback chain (first non-empty wins):
 *   API key:  SENTINEL_{REVIEWER}_API_KEY → AGENT_SERVICE_TOKEN → LLM_API_KEY → OPENAI_API_KEY
 *   Base URL: SENTINEL_{REVIEWER}_BASE_URL → LLM_BASE_URL → OPENROUTER_BASE_URL → OpenRouter default
 *   Model:    SENTINEL_{REVIEWER}_MODEL (or SENTINEL_MODEL / SENTINEL_EVE_* for EVE script)
 */

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const API_KEY_CHAIN = [
  (reviewer) => `SENTINEL_${reviewer}_API_KEY`,
  () => 'AGENT_SERVICE_TOKEN',
  () => 'LLM_API_KEY',
  () => 'OPENAI_API_KEY',
];

const BASE_URL_CHAIN = [
  (reviewer) => `SENTINEL_${reviewer}_BASE_URL`,
  () => 'LLM_BASE_URL',
  () => 'OPENROUTER_BASE_URL',
];

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstEnv(names) {
  for (const name of names) {
    const value = trim(process.env[name]);
    if (value) return { name, value };
  }
  return { name: names[0], value: '' };
}

function inferProviderFromBaseUrl(baseUrl) {
  const host = baseUrl.toLowerCase();
  if (host.includes('openrouter.ai')) return 'openrouter';
  if (host.includes('api.openai.com')) return 'openai';
  if (host.includes('anthropic.com')) return 'anthropic';
  if (host.includes('generativelanguage.googleapis.com')) return 'google';
  return 'llm';
}

/**
 * @param {'AUREA'|'ATLAS'|'EVE'} reviewer
 * @param {{ modelEnv?: string; role?: 'primary'|'fallback' }} [options]
 */
export function resolveSentinelLlmConfig(reviewer, options = {}) {
  const role = options.role ?? 'primary';
  const prefix =
    role === 'fallback' && reviewer === 'EVE'
      ? 'SENTINEL_EVE_FALLBACK'
      : `SENTINEL_${reviewer}`;

  const apiKeyNames =
    role === 'fallback' && reviewer === 'EVE'
      ? [
          'SENTINEL_EVE_FALLBACK_API_KEY',
          `SENTINEL_${reviewer}_API_KEY`,
          'AGENT_SERVICE_TOKEN',
          'LLM_API_KEY',
          'OPENAI_API_KEY',
        ]
      : API_KEY_CHAIN.map((fn) => fn(reviewer));

  const baseUrlNames =
    role === 'fallback' && reviewer === 'EVE'
      ? [
          'SENTINEL_EVE_FALLBACK_BASE_URL',
          `SENTINEL_${reviewer}_BASE_URL`,
          'LLM_BASE_URL',
          'OPENROUTER_BASE_URL',
        ]
      : BASE_URL_CHAIN.map((fn) => fn(reviewer));

  const modelEnv =
    options.modelEnv ??
    (role === 'fallback' && reviewer === 'EVE'
      ? 'SENTINEL_EVE_FALLBACK_MODEL'
      : role === 'primary' && reviewer === 'EVE'
        ? 'SENTINEL_EVE_MODEL'
        : 'SENTINEL_MODEL');

  const model = trim(process.env[modelEnv] ?? process.env[`${prefix}_MODEL`]);

  const apiKey = firstEnv(apiKeyNames);
  const baseUrlResolved = firstEnv(baseUrlNames);
  const baseUrl = (baseUrlResolved.value || DEFAULT_BASE_URL).replace(/\/$/, '');

  const provider =
    trim(process.env[`${prefix}_PROVIDER`]) ||
    trim(process.env.LLM_PROVIDER) ||
    inferProviderFromBaseUrl(baseUrl);

  const credentialHint =
    role === 'fallback' && reviewer === 'EVE'
      ? 'SENTINEL_EVE_FALLBACK_API_KEY|AGENT_SERVICE_TOKEN|LLM_API_KEY'
      : `SENTINEL_${reviewer}_API_KEY|AGENT_SERVICE_TOKEN|LLM_API_KEY`;

  return {
    reviewer,
    role,
    apiKey: apiKey.value,
    apiKeySource: apiKey.name,
    baseUrl,
    baseUrlSource: baseUrlResolved.value ? baseUrlResolved.name : 'default(openrouter)',
    model,
    modelEnv,
    provider,
    credentialHint,
  };
}

export async function callOpenAiCompatibleChat(config, messages) {
  const repo = process.env.GITHUB_REPOSITORY ?? 'kaizencycle/mobius-civic-ai-terminal';
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  if (config.baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = `https://github.com/${repo}`;
    headers['X-Title'] = 'Mobius Sentinel Review';
  }

  return fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      max_tokens: 1200,
      messages,
    }),
  });
}
