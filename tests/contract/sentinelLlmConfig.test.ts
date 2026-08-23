// Sentinel LLM config resolution — model-agnostic per-lane credentials
// Run: tsx tests/contract/sentinelLlmConfig.test.ts

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSentinelLlmConfig } from '../../scripts/sentinel-llm-config.mjs';

const ENV_KEYS = [
  'SENTINEL_AUREA_API_KEY',
  'SENTINEL_ATLAS_API_KEY',
  'SENTINEL_EVE_API_KEY',
  'AGENT_SERVICE_TOKEN',
  'LLM_API_KEY',
  'OPENAI_API_KEY',
  'SENTINEL_AUREA_BASE_URL',
  'LLM_BASE_URL',
  'OPENROUTER_BASE_URL',
  'SENTINEL_MODEL',
  'SENTINEL_AUREA_MODEL',
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
    process.env.SENTINEL_MODEL = 'custom/model';

    const config = resolveSentinelLlmConfig('AUREA', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKey, 'lane-key');
    assert.equal(config.apiKeySource, 'SENTINEL_AUREA_API_KEY');
    assert.equal(config.model, 'custom/model');
  });

  it('falls back to AGENT_SERVICE_TOKEN then LLM_API_KEY', () => {
    process.env.LLM_API_KEY = 'generic-key';
    let config = resolveSentinelLlmConfig('ATLAS', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKey, 'generic-key');

    delete process.env.LLM_API_KEY;
    process.env.AGENT_SERVICE_TOKEN = 'shared-key';
    config = resolveSentinelLlmConfig('ATLAS', { modelEnv: 'SENTINEL_MODEL' });
    assert.equal(config.apiKey, 'shared-key');
    assert.equal(config.apiKeySource, 'AGENT_SERVICE_TOKEN');
  });

  it('uses per-lane base URL when set', () => {
    process.env.SENTINEL_EVE_API_KEY = 'eve-key';
    process.env.SENTINEL_EVE_BASE_URL = 'https://api.openai.com/v1';
    process.env.SENTINEL_EVE_MODEL = 'gpt-4o-mini';

    const config = resolveSentinelLlmConfig('EVE', { modelEnv: 'SENTINEL_EVE_MODEL' });
    assert.equal(config.baseUrl, 'https://api.openai.com/v1');
    assert.equal(config.provider, 'openai');
  });

  it('EVE fallback role reads fallback env names', () => {
    process.env.SENTINEL_EVE_FALLBACK_API_KEY = 'fallback-key';
    process.env.SENTINEL_EVE_FALLBACK_MODEL = 'fallback/model';

    const config = resolveSentinelLlmConfig('EVE', {
      modelEnv: 'SENTINEL_EVE_FALLBACK_MODEL',
      role: 'fallback',
    });
    assert.equal(config.apiKey, 'fallback-key');
    assert.equal(config.model, 'fallback/model');
    assert.equal(config.role, 'fallback');
  });
});
