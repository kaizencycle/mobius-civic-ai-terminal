import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isNextDynamicServerUsageError,
  rethrowIfDynamicServerUsage,
} from '../../lib/kv/dynamicServerUsage.js';

describe('dynamicServerUsage', () => {
  it('detects DYNAMIC_SERVER_USAGE digest', () => {
    assert.equal(isNextDynamicServerUsageError({ digest: 'DYNAMIC_SERVER_USAGE' }), true);
  });

  it('detects Dynamic server usage message', () => {
    assert.equal(
      isNextDynamicServerUsageError({ message: "Dynamic server usage: Route /terminal couldn't be rendered statically" }),
      true,
    );
  });

  it('ignores ordinary KV errors', () => {
    assert.equal(isNextDynamicServerUsageError(new Error('ECONNRESET')), false);
  });

  it('rethrows dynamic server usage', () => {
    const err = { digest: 'DYNAMIC_SERVER_USAGE' };
    assert.throws(() => rethrowIfDynamicServerUsage(err), (e) => e === err);
  });

  it('does not rethrow ordinary errors', () => {
    assert.doesNotThrow(() => rethrowIfDynamicServerUsage(new Error('timeout')));
  });
});
