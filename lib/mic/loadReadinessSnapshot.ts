/**
 * C-287 — MIC readiness snapshot: KV first, then OAA bridge (same envelope as KV).
 */

import { kvBridgeConfigured, kvBridgeRead } from '@/lib/kv/kvBridgeClient';
import { kvGet, KV_KEYS } from '@/lib/kv/store';

export type MicReadinessSnapshotSource = 'kv' | 'oaa' | 'none';

export async function loadMicReadinessSnapshotRaw(): Promise<{
  raw: string | null;
  source: MicReadinessSnapshotSource;
}> {
  const fromKv = await kvGet<string>(KV_KEYS.MIC_READINESS_SNAPSHOT);
  if (fromKv !== null && fromKv !== undefined && String(fromKv).trim() !== '') {
    return {
      raw: typeof fromKv === 'string' ? fromKv : JSON.stringify(fromKv),
      source: 'kv',
    };
  }
  if (!kvBridgeConfigured()) {
    return { raw: null, source: 'none' };
  }
  const row = await kvBridgeRead('MIC_READINESS_SNAPSHOT');
  if (!row?.ok || row.value == null) {
    return { raw: null, source: 'none' };
  }
  if (typeof row.value === 'string') {
    return { raw: row.value, source: 'oaa' };
  }
  try {
    return { raw: JSON.stringify(row.value), source: 'oaa' };
  } catch {
    return { raw: null, source: 'none' };
  }
}
