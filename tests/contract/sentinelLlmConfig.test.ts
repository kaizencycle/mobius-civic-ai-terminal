// Sentinel LLM config resolution — model-agnostic per-lane credentials
// Run: tsx tests/contract/sentinelLlmConfig.test.ts

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSentinelLlmConfig,
  SENTINEL_EVE_FALLBACK_CREDENTIAL_HINT,
  SENTINEL_LLM_CREDENTIAL_HINT,
} from '../../scripts/sentinel-llm-config.mjs';

const ENV_KEYS = [
  'SENTINEL_AUREA_API_KEY',
  'SENTINEL_ATLAS_API_KEY',
  'SENTINEL_EVE_API_KEY',
  'SENTINEL_EVE_FALLBACK_API_KEY',
  'AGENT_SERVICE_TOKEN',
  'LLM_API_KEY',
  'OPENAI_API_KEY',
  'SENTINEL_AUREA_BASE_URL',
  'SENTINEL_EVE_BASE_URL',
  'SENTINEL_EVE_FALLBACK_BASE_URL',
  'LLM_BASE_URL',
  'OPENROUTER_BASE_URL',
  'SENTINEL_MODEL',
  'SENTINEL_AUREA_MODEL',
  'SENTINEL_EVE_MODEL',
  'SENTINEL_EVE_FALLBACK_MODEL',
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('resolveSentinelLlmConfig', () => {
  it('prefers per-lane API key over shared fallbacks', () => {
    process.env.SENTINEL_AUREA_API_KEY = 'lane-key';
    process.env.AGENT_SERVICE_TOKEN = 'shared-key';
    process.env.LLM_API_KEY = 'generic-key';
    process.env.LLM_BASE_URL = 'https://custom.example/v1';
    process.env.SENTINEL_MODEL = 'custom/model';

    const config = resolveSentinelLlmConfig('AUREA', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKey, 'lane-key');
    assert.equal(config.apiKeySource, 'SENTINEL_AUREA_API_KEY');
    assert.equal(config.baseUrl, 'https://openrouter.ai/api/v1');
    assert.equal(config.profileId, 'lane');
    assert.equal(config.model, 'custom/model');
  });

  it('pairs lane key with lane base URL only', () => {
    process.env.SENTINEL_EVE_API_KEY = 'eve-key';
    process.env.SENTINEL_EVE_BASE_URL = 'https://api.openai.com/v1';
    process.env.LLM_BASE_URL = 'https://custom.example/v1';
    process.env.SENTINEL_EVE_MODEL = 'gpt-4o-mini';

    const config = resolveSentinelLlmConfig('EVE', { modelEnv: 'SENTINEL_EVE_MODEL' });
    assert.equal(config.baseUrl, 'https://api.openai.com/v1');
    assert.equal(config.provider, 'openai');
    assert.equal(config.profileId, 'lane');
  });

  it('does not send AGENT_SERVICE_TOKEN to LLM_BASE_URL', () => {
    process.env.AGENT_SERVICE_TOKEN = 'shared-key';
    process.env.LLM_BASE_URL = 'https://custom.example/v1';

    const config = resolveSentinelLlmConfig('ATLAS', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKey, 'shared-key');
    assert.equal(config.baseUrl, 'https://openrouter.ai/api/v1');
    assert.equal(config.profileId, 'openrouter');
  });

  it('requires LLM_API_KEY and LLM_BASE_URL together', () => {
    process.env.LLM_API_KEY = 'generic-key';
    let config = resolveSentinelLlmConfig('ATLAS', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKey, '');

    process.env.LLM_BASE_URL = 'https://custom.example/v1';
    config = resolveSentinelLlmConfig('ATLAS', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKey, 'generic-key');
    assert.equal(config.baseUrl, 'https://custom.example/v1');
    assert.equal(config.profileId, 'llm_pair');
  });

  it('falls back to AGENT_SERVICE_TOKEN before LLM pair', () => {
    process.env.LLM_API_KEY = 'generic-key';
    process.env.AGENT_SERVICE_TOKEN = 'shared-key';

    const config = resolveSentinelLlmConfig('ATLAS', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKey, 'shared-key');
    assert.equal(config.apiKeySource, 'AGENT_SERVICE_TOKEN');
  });

  it('resolves OPENAI_API_KEY to OpenAI base URL', () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    const config = resolveSentinelLlmConfig('AUREA', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKeySource, 'OPENAI_API_KEY');
    assert.equal(config.baseUrl, 'https://api.openai.com/v1');
    assert.equal(config.profileId, 'openai');
  });

  it('EVE fallback uses fallback profile prefix only', () => {
    process.env.SENTINEL_EVE_API_KEY = 'primary-key';
    process.env.SENTINEL_EVE_FALLBACK_BASE_URL = 'https://fallback.example/v1';
    process.env.SENTINEL_EVE_FALLBACK_API_KEY = 'fallback-key';
    process.env.SENTINEL_EVE_FALLBACK_MODEL = 'fallback/model';

    const config = resolveSentinelLlmConfig('EVE', {
      modelEnv: 'SENTINEL_EVE_FALLBACK_MODEL',
      role: 'fallback',
    });
    assert.equal(config.apiKey, 'fallback-key');
    assert.equal(config.baseUrl, 'https://fallback.example/v1');
    assert.equal(config.profileId, 'lane');
    assert.equal(config.credentialHint, SENTINEL_EVE_FALLBACK_CREDENTIAL_HINT);
  });

  it('credential hints document full accepted chains', () => {
    assert.match(SENTINEL_LLM_CREDENTIAL_HINT, /OPENAI_API_KEY/);
    assert.match(SENTINEL_LLM_CREDENTIAL_HINT, /LLM_API_KEY\+LLM_BASE_URL/);
    const config = resolveSentinelLlmConfig('AUREA', { modelEnv: 'SENTINEL_MODEL' });
    assert.match(config.credentialHint, /OPENAI_API_KEY/);
  });
});
