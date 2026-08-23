// C-397: migrate-v1 must reject CAS pointer keys and non-object v1 bodies.
//
// Run: tsx tests/contract/migrateV1Guard.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isReservedVaultSealId,
  listV1SealIdsFromKvInspect,
  parseV1SealRecord,
  validateMigratableSealId,
} from '../../lib/vault-v2/reservedSealIds.js';

describe('migrate-v1 reserved seal id guard', () => {
  it('rejects latest CAS pointer id', () => {
    assert.equal(isReservedVaultSealId('latest'), true);
    const r = validateMigratableSealId('latest');
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /reserved_seal_id/);
    }
  });

  it('rejects candidate pointer id', () => {
    assert.equal(isReservedVaultSealId('candidate'), true);
  });

  it('accepts normal seal suffix ids', () => {
    const r = validateMigratableSealId('seal-C-372-002');
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.sealId, 'seal-C-372-002');
  });

  it('parseV1SealRecord rejects plain string (corrupted latest pointer body)', () => {
    assert.equal(parseV1SealRecord('seal-C-372-002'), null);
  });

  it('parseV1SealRecord rejects spread-string object corruption pattern', () => {
    const corrupted = {
      '0': 's',
      '1': 'e',
      sealId: 'latest',
      schema_version: 'v2',
    };
    assert.equal(parseV1SealRecord(corrupted), null);
  });

  it('parseV1SealRecord accepts v1 object with hash', () => {
    const v1 = parseV1SealRecord({ hash: 'abc123', cycle: 'C-300' });
    assert.ok(v1);
    assert.equal(v1?.hash, 'abc123');
  });

  it('listV1SealIdsFromKvInspect excludes CAS pointer keys and string pointers', () => {
    const ids = listV1SealIdsFromKvInspect([
      { key: 'vault:seal:latest', sample: 'seal-C-372-002' },
      { key: 'vault:seal:candidate', sample: 'seal-C-372-001' },
      { key: 'vault:seal:seal-C-300-001', sample: { hash: 'deadbeef', cycle: 'C-300' } },
      {
        key: 'vault:seal:seal-C-301-002',
        sample: { schema_version: 'v2', hash: 'abc', sealId: 'seal-C-301-002' },
      },
    ]);
    assert.deepEqual(ids, ['seal-C-300-001']);
  });
});
