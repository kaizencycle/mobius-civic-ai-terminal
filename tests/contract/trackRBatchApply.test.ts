// C-404/C-405: Track R batch apply (P2 executable path — dry-run default, no production writes in CI)
// Run: tsx tests/contract/trackRBatchApply.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  InMemoryBatchApplyMutationJournal,
  InMemoryLineageStore,
  LINEAGE_ACTIVE_VERSION_KEY,
  runBatchApply,
  TRACK_R_BATCH_REPAIR_ID,
  buildJournalId,
} from '@/lib/watchdog/batchRepair';
import {
  assertOneShotApplyNotConsumed,
  TRACK_R_ALLOW_PRODUCTION_WRITES_ENV,
} from '@/lib/watchdog/batchRepair/oneShotExecutionGuard';
import { verifyRollbackPlanForApply } from '@/lib/watchdog/batchRepair/verifyRollbackPlanForApply';
import { buildRollbackPlan } from '@/lib/watchdog/batchRepair/rollbackPlan';
import { loadFixtures } from './trackRBatchApplyPreflightFixtures';
import {
  CAPTURE_2014Z_EXPECTED_HASHES,
  CAPTURE_2014Z_ID,
} from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import { BATCH_EXECUTION_FEATURE_FLAG } from '@/lib/watchdog/batchRepair/commitGuard';

const KV_ENV_KEYS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

function buildValidHandoffContent(): string {
  return [
    '# Track R P3 one-shot execution handoff (test fixture)',
    `capture_id: ${CAPTURE_2014Z_ID}`,
    `semantic_manifest_hash: ${CAPTURE_2014Z_EXPECTED_HASHES.semantic_manifest_hash}`,
    `lineage_snapshot_hash: ${CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash}`,
    `execution_witness_hash: ${CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash}`,
    `rollback_manifest_hash: ${CAPTURE_2014Z_EXPECTED_HASHES.rollback_manifest_hash}`,
    'ONE_SHOT_EXECUTION_AUTHORIZED',
    'one_shot_execution_authorized: true',
  ].join('\n');
}

async function withKvCredentialsCleared<T>(fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(KV_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of KV_ENV_KEYS) {
    delete process.env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of KV_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

async function withApplyEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const keys = [BATCH_EXECUTION_FEATURE_FLAG, TRACK_R_ALLOW_PRODUCTION_WRITES_ENV];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

describe('Track R batch apply (P2 executable path)', () => {
  it('defaults to dry-run with zero writes and execution_authorized false', async () => {
    await withKvCredentialsCleared(async () => {
      const result = await runBatchApply({
        skipCasProbe: true,
        verifiedAt: '2026-08-18T02:00:00.000Z',
      });

      assert.equal(result.mode, 'dry_run');
      assert.equal(result.apply_status, 'dry_run_pass');
      assert.equal(result.execution_authorized, false);
      assert.equal(result.production_mutation_performed, false);
      assert.equal(result.writes_performed, 0);
      assert.equal(result.capture_id, CAPTURE_2014Z_ID);
      assert.equal(
        result.attested_lineage_snapshot_hash,
        CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash,
      );
      assert.ok(result.mutation_journal);
      assert.ok(result.mutation_journal!.journal_hash);
      assert.equal(result.rollback_plan_verified, true);
      assert.equal(result.one_shot_guard_ok, true);
    });
  });

  it('blocks live apply without P3 execution handoff', async () => {
    await withKvCredentialsCleared(async () => {
      await withApplyEnv(
        {
          [BATCH_EXECUTION_FEATURE_FLAG]: 'true',
          [TRACK_R_ALLOW_PRODUCTION_WRITES_ENV]: 'true',
        },
        async () => {
          const result = await runBatchApply({
            apply: true,
            explicitOperatorCommand: true,
            skipCasProbe: true,
            store: new InMemoryLineageStore(),
            verifiedAt: '2026-08-18T02:01:00.000Z',
          });

          assert.equal(result.mode, 'live_apply');
          assert.equal(result.apply_status, 'live_apply_blocked');
          assert.equal(result.execution_authorized, false);
          assert.equal(result.production_mutation_performed, false);
          assert.equal(result.writes_performed, 0);
          assert.ok(result.errors.some((error) => error.includes('execution handoff')));
        },
      );
    });
  });

  it('blocks wrong capture id binding', async () => {
    await withKvCredentialsCleared(async () => {
      const result = await runBatchApply({
        captureId: 'track-r-c403-2026-08-15T0123Z',
        skipCasProbe: true,
        verifiedAt: '2026-08-18T02:02:00.000Z',
      });

      assert.notEqual(result.apply_status, 'dry_run_pass');
      assert.ok(result.errors.some((error) => error.includes('Capture #9')));
    });
  });

  it('verifyRollbackPlanForApply accepts fixture rollback plan', () => {
    const { manifest } = loadFixtures();
    const plan = buildRollbackPlan({
      manifest,
      previous_active_version: 'prior-repair',
      previous_latest_pointer: 'prior-latest',
    });
    const verified = verifyRollbackPlanForApply(plan);
    assert.equal(verified.ok, true, verified.errors.join('; '));
  });

  it('one-shot guard rejects repeat activation in store and journal', () => {
    const store = new InMemoryLineageStore();
    store.set(LINEAGE_ACTIVE_VERSION_KEY, TRACK_R_BATCH_REPAIR_ID);

    const journal = new InMemoryBatchApplyMutationJournal(
      buildJournalId({
        capture_id: CAPTURE_2014Z_ID,
        repair_id: TRACK_R_BATCH_REPAIR_ID,
        verified_at: '2026-08-18T02:03:00.000Z',
      }),
      CAPTURE_2014Z_ID,
      TRACK_R_BATCH_REPAIR_ID,
      '2026-08-18T02:03:00.000Z',
    );

    const storeGuard = assertOneShotApplyNotConsumed({
      journal,
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      store,
    });
    assert.equal(storeGuard.ok, false);

    const freshStore = new InMemoryLineageStore();
    journal.append({
      at: '2026-08-18T02:03:01.000Z',
      operation: 'track_r_batch_apply_activation',
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      capture_id: CAPTURE_2014Z_ID,
      mode: 'live_apply',
      lineage_snapshot_hash: CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash,
      execution_witness_hash: CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash,
      before: { active_version: null },
      after: { active_version: TRACK_R_BATCH_REPAIR_ID },
    });

    const journalGuard = assertOneShotApplyNotConsumed({
      journal,
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      store: freshStore,
    });
    assert.equal(journalGuard.ok, false);
  });

  it('performs in-memory live apply with P3 handoff and post-write verification', async () => {
    await withKvCredentialsCleared(async () => {
      const handoffDir = mkdtempSync(join(tmpdir(), 'track-r-handoff-'));
      const handoffPath = join(handoffDir, 'TRACK_R_V2_EXECUTION_HANDOFF_SIGNED.md');
      writeFileSync(handoffPath, buildValidHandoffContent(), 'utf8');

      try {
        await withApplyEnv(
          {
            [BATCH_EXECUTION_FEATURE_FLAG]: 'true',
            [TRACK_R_ALLOW_PRODUCTION_WRITES_ENV]: 'true',
          },
          async () => {
            const store = new InMemoryLineageStore();
            const result = await runBatchApply({
              apply: true,
              explicitOperatorCommand: true,
              skipCasProbe: true,
              store,
              handoffPath,
              verifiedAt: '2026-08-18T02:04:00.000Z',
            });

            assert.equal(result.mode, 'live_apply');
            assert.equal(result.apply_status, 'live_apply_pass');
            assert.equal(result.execution_authorized, false);
            assert.equal(result.production_mutation_performed, true);
            assert.equal(result.writes_performed, 4);
            assert.equal(result.post_write_verification_ok, true);
            assert.equal(store.get(LINEAGE_ACTIVE_VERSION_KEY), TRACK_R_BATCH_REPAIR_ID);
            assert.ok(result.write_records.length >= 4);
            assert.ok(
              result.write_records.every(
                (record) => record.key.length > 0 && typeof record.after === 'string',
              ),
            );

            const repeat = await runBatchApply({
              apply: true,
              explicitOperatorCommand: true,
              skipCasProbe: true,
              store,
              handoffPath,
              verifiedAt: '2026-08-18T02:05:00.000Z',
            });
            assert.equal(repeat.one_shot_guard_ok, false);
            assert.notEqual(repeat.apply_status, 'live_apply_pass');
            assert.equal(repeat.production_mutation_performed, false);
          },
        );
      } finally {
        rmSync(handoffDir, { recursive: true, force: true });
      }
    });
  });
});
