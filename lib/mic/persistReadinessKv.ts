/**
 * Optional KV hydration for MIC readiness when no upstream Substrate snapshot is in KV.
 * Keeps `MIC_READINESS_SNAPSHOT` warm for GI chain / probes without claiming external authority.
 */

import type { MicReadinessResponse } from '@/lib/mic/types';
import { withHash } from '@/lib/mic/hash';
import { kvSet, KV_KEYS, KV_TTL_SECONDS } from '@/lib/kv/store';
import { scheduleKvBridgeDualWrite } from '@/lib/kv/kvBridgeClient';

export async function persistLocalMicReadinessSnapshot(merged: MicReadinessResponse): Promise<void> {
  const { readiness_proof: _readinessProofOmit, ...forHash } = merged;
  void _readinessProofOmit;
  const proof = withHash(forHash);
  const body: MicReadinessResponse = {
    ...merged,
    readiness_proof: {
      hash: proof.hash,
      hash_algorithm: 'sha256',
    },
  };
  const snapshot = {
    snapshot: body,
    received_at: new Date().toISOString(),
    source: 'terminal-readiness-hydrate',
  };
  const snapStr = JSON.stringify(snapshot);
  await kvSet(KV_KEYS.MIC_READINESS_SNAPSHOT, snapStr, KV_TTL_SECONDS.MIC_READINESS_SNAPSHOT);
  scheduleKvBridgeDualWrite(
    'MIC_READINESS_SNAPSHOT',
    snapshot as unknown,
    KV_TTL_SECONDS.MIC_READINESS_SNAPSHOT,
    'mic-readiness-hydrate',
  );
}
