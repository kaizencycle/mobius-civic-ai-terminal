// C-386: swarm cron tier-1 routes to OpenAI-compatible provider; Anthropic optional at gate.
// Run: tsx tests/contract/swarmMultiProvider.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TIER_MODEL,
  TIER_PROVIDER,
  CREDIT_COOLDOWN_FALLBACK_MODEL,
  CREDIT_COOLDOWN_FALLBACK_PROVIDER,
} from '../../lib/swarm/activation';
import { tierCostUsd } from '../../lib/swarm/budget';
import { parseAgentJsonFromLlmText } from '../../lib/swarm/parseAgentResponse';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('swarm multi-provider dispatch (C-386)', () => {
  it('tier 1 uses openai-compatible provider and DeepSeek V4 Flash model id', () => {
    assert.equal(TIER_PROVIDER[1], 'openai-compatible');
    assert.equal(TIER_MODEL[1], 'deepseek-v4-flash');
    assert.equal(TIER_PROVIDER[2], 'anthropic');
    assert.equal(TIER_PROVIDER[3], 'anthropic');
  });

  it('credit cooldown fallback matches tier-1 provider', () => {
    assert.equal(CREDIT_COOLDOWN_FALLBACK_PROVIDER, 'openai-compatible');
    assert.equal(CREDIT_COOLDOWN_FALLBACK_MODEL, TIER_MODEL[1]);
  });

  it('tier-1 budget cost stays below tier 2 (no monotonic-order break)', () => {
    assert.ok(tierCostUsd(1) < tierCostUsd(2));
    assert.ok(tierCostUsd(2) < tierCostUsd(3));
  });

  it('route dispatches anthropic vs openai-compat in callAgent', () => {
    const src = readRepoFile('app/api/cron/swarm/route.ts');
    assert.match(src, /import OpenAI from 'openai'/);
    assert.match(src, /getOpenAICompatClient/);
    assert.match(src, /effectiveProvider === 'anthropic'/);
    assert.match(src, /compatClient\.chat\.completions\.create/);
    assert.match(src, /no_llm_provider_configured/);
    assert.doesNotMatch(src, /ANTHROPIC_API_KEY_missing/);
    assert.match(src, /CREDIT_COOLDOWN_FALLBACK_MODEL/);
    assert.match(src, /parseAgentJsonFromLlmText/);
  });

  it('parses JSON from fenced and bare object shapes', () => {
    const fenced = parseAgentJsonFromLlmText(
      'Here is the result:\n```json\n{"ok":true,"confidence":0.9}\n```\n',
    ) as Record<string, unknown>;
    assert.equal(fenced.ok, true);
    assert.equal(fenced.confidence, 0.9);

    const bare = parseAgentJsonFromLlmText('{"priority":"high","confidence":0.8}') as Record<string, unknown>;
    assert.equal(bare.priority, 'high');

    const prose = parseAgentJsonFromLlmText('not json at all') as Record<string, unknown>;
    assert.ok('raw' in prose);
  });
});
