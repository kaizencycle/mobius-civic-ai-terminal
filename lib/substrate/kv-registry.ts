// C-356 — KV key tier classification.
//
// Tiers:
//   derived      — can be recomputed from substrate / CPC if KV is suspended.
//   canon-bound  — must be written to substrate first; KV is a mirror.
//   checkpoint   — lightweight heartbeat / cursor keys; miss is non-fatal.
//   ephemeral    — cache-only; safe to drop entirely on suspension.

export type KvTier = 'derived' | 'canon-bound' | 'checkpoint' | 'ephemeral';

export const KEY_TIERS: Record<string, KvTier> = {
  'gi:latest': 'derived',
  'gi:trend': 'derived',
  'gi:latest_carry': 'derived',
  'journal:index': 'derived',
  'mic:readiness:snapshot': 'derived',
  'mic:readiness:feed': 'derived',
  'signals:latest': 'derived',
  'echo:state': 'derived',
  'tripwire:state': 'derived',
  'system:pulse': 'derived',
  'SENTIMENT_SNAPSHOT': 'derived',

  'vault-attestation:lastRun': 'checkpoint',
  'heartbeat:last': 'checkpoint',
  'LAST_PROMOTION_RUN_AT': 'checkpoint',
  'tripwire:kv:heartbeat': 'checkpoint',
  'ledger:circuit_open': 'checkpoint',

  'cache:integrity-status': 'ephemeral',
  'cache:lane-diagnostics': 'ephemeral',
  'snapshot:coalesce': 'ephemeral',
  'signals:micro:cache:v2': 'ephemeral',
};

export function tierForKey(key: string): KvTier {
  if (KEY_TIERS[key]) return KEY_TIERS[key];
  if (key.startsWith('journal:') && !key.endsWith(':index')) return 'canon-bound';
  if (key.startsWith('mic:quorum:')) return 'derived';
  if (key.startsWith('swarm:')) return 'ephemeral';
  if (key.startsWith('agent:meta:')) return 'derived';
  return 'ephemeral';
}
