/**
 * Per-lane LLM configuration for Sentinel Review (OpenAI-compatible chat/completions).
 *
 * Credentials resolve as **paired provider profiles** — never mix a key from one
 * profile with a base URL from another (prevents sending secrets to the wrong host).
 *
 * Profile order (first complete profile wins):
 *   1. Lane:     SENTINEL_{REVIEWER}_API_KEY [+ optional SENTINEL_{REVIEWER}_BASE_URL → OpenRouter default]
 *   2. OpenRouter shared: AGENT_SERVICE_TOKEN [+ OPENROUTER_BASE_URL → OpenRouter default]
 *   3. Generic LLM pair:  LLM_API_KEY + LLM_BASE_URL (both required)
 *   4. OpenAI direct:     OPENAI_API_KEY → https://api.openai.com/v1
 *
 * EVE fallback uses SENTINEL_EVE_FALLBACK_* as its lane profile prefix (not primary EVE key).
 */

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export const SENTINEL_LLM_CREDENTIAL_HINT =
  'SENTINEL_{REVIEWER}_API_KEY|AGENT_SERVICE_TOKEN|LLM_API_KEY+LLM_BASE_URL|OPENAI_API_KEY';

export const SENTINEL_EVE_FALLBACK_CREDENTIAL_HINT =
  'SENTINEL_EVE_FALLBACK_API_KEY|AGENT_SERVICE_TOKEN|LLM_API_KEY+LLM_BASE_URL|OPENAI_API_KEY';

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
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
 * @typedef {object} LlmProfile
 * @property {string} id
 * @property {string} keyEnv
 * @property {string} [baseUrlEnv]
 * @property {string} [defaultBaseUrl]
 * @property {string} [providerEnv]
 * @property {boolean} [requirePairedBase] — both keyEnv and baseUrlEnv must be set
 * @property {boolean} [fixedBase] — ignore baseUrlEnv; always use defaultBaseUrl
 */

/** @returns {LlmProfile[]} */
function profilesFor(reviewer, role) {
  const lanePrefix =
    role === 'fallback' && reviewer === 'EVE' ? 'SENTINEL_EVE_FALLBACK' : `SENTINEL_${reviewer}`;

  return [
    {
      id: 'lane',
      keyEnv: `${lanePrefix}_API_KEY`,
      baseUrlEnv: `${lanePrefix}_BASE_URL`,
      defaultBaseUrl: DEFAULT_BASE_URL,
      providerEnv: `${lanePrefix}_PROVIDER`,
    },
    {
      id: 'openrouter',
      keyEnv: 'AGENT_SERVICE_TOKEN',
      baseUrlEnv: 'OPENROUTER_BASE_URL',
      defaultBaseUrl: DEFAULT_BASE_URL,
    },
    {
      id: 'llm_pair',
      keyEnv: 'LLM_API_KEY',
      baseUrlEnv: 'LLM_BASE_URL',
      requirePairedBase: true,
    },
    {
      id: 'openai',
      keyEnv: 'OPENAI_API_KEY',
      defaultBaseUrl: OPENAI_BASE_URL,
      fixedBase: true,
    },
  ];
}

/** @param {LlmProfile[]} profiles */
function resolveProviderProfile(profiles) {
  for (const profile of profiles) {
    const apiKey = trim(process.env[profile.keyEnv]);
    if (!apiKey) continue;

    if (profile.requirePairedBase) {
      const pairedBase = trim(process.env[profile.baseUrlEnv]);
      if (!pairedBase) continue;
      const baseUrl = pairedBase.replace(/\/$/, '');
      const provider =
        trim(process.env[profile.providerEnv ?? '']) ||
        trim(process.env.LLM_PROVIDER) ||
        inferProviderFromBaseUrl(baseUrl);
      return {
        apiKey,
        apiKeySource: profile.keyEnv,
        baseUrl,
        baseUrlSource: profile.baseUrlEnv,
        provider,
        profileId: profile.id,
      };
    }

    const explicitBase = profile.fixedBase
      ? ''
      : profile.baseUrlEnv
        ? trim(process.env[profile.baseUrlEnv])
        : '';
    const baseUrl = (explicitBase || profile.defaultBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    const provider =
      trim(process.env[profile.providerEnv ?? '']) ||
      trim(process.env.LLM_PROVIDER) ||
      inferProviderFromBaseUrl(baseUrl);

    return {
      apiKey,
      apiKeySource: profile.keyEnv,
      baseUrl,
      baseUrlSource: explicitBase
        ? profile.baseUrlEnv
        : profile.fixedBase
          ? `fixed(${profile.defaultBaseUrl})`
          : `default(${profile.defaultBaseUrl ?? DEFAULT_BASE_URL})`,
      provider,
      profileId: profile.id,
    };
  }

  return null;
}

/**
 * @param {'AUREA'|'ATLAS'|'EVE'} reviewer
 * @param {{ modelEnv?: string; role?: 'primary'|'fallback' }} [options]
 */
export function resolveSentinelLlmConfig(reviewer, options = {}) {
  const role = options.role ?? 'primary';
  const prefix =
    role === 'fallback' && reviewer === 'EVE' ? 'SENTINEL_EVE_FALLBACK' : `SENTINEL_${reviewer}`;

  const modelEnv =
    options.modelEnv ??
    (role === 'fallback' && reviewer === 'EVE'
      ? 'SENTINEL_EVE_FALLBACK_MODEL'
      : role === 'primary' && reviewer === 'EVE'
        ? 'SENTINEL_EVE_MODEL'
        : 'SENTINEL_MODEL');

  const model = trim(process.env[modelEnv] ?? process.env[`${prefix}_MODEL`]);
  const resolved = resolveProviderProfile(profilesFor(reviewer, role));

  const credentialHint =
    role === 'fallback' && reviewer === 'EVE'
      ? SENTINEL_EVE_FALLBACK_CREDENTIAL_HINT
      : SENTINEL_LLM_CREDENTIAL_HINT.replace('{REVIEWER}', reviewer);

  if (!resolved) {
    return {
      reviewer,
      role,
      apiKey: '',
      apiKeySource: '',
      baseUrl: DEFAULT_BASE_URL,
      baseUrlSource: 'unresolved',
      model,
      modelEnv,
      provider: 'llm',
      credentialHint,
      profileId: null,
    };
  }

  return {
    reviewer,
    role,
    apiKey: resolved.apiKey,
    apiKeySource: resolved.apiKeySource,
    baseUrl: resolved.baseUrl,
    baseUrlSource: resolved.baseUrlSource,
    model,
    modelEnv,
    provider: resolved.provider,
    credentialHint,
    profileId: resolved.profileId,
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
