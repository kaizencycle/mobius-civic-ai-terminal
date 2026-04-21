/**
 * Selective backup Redis mirror (C-287 KV burn reduction).
 * Only continuity-critical keys are mirrored when MOBIUS_KV_BACKUP_MIRROR is on.
 *
 * Key strings must stay aligned with `KV_KEYS` in `store.ts` (no import — avoids circular deps).
 */

const MIRROR_LOGICAL_KEYS = new Set<string>([
  'mic:readiness:snapshot',
  'signals:latest',
  'gi:latest',
  'heartbeat:last',
  'system:pulse',
  'operator:current_cycle',
  'vault:global:balance',
  'vault:global:meta',
  'tripwire:state',
  'echo:state',
]);

const MIRROR_RAW_KEYS = new Set<string>(['TRIPWIRE_STATE']);

const PREFIX = 'mobius:';

export function shouldMirrorPrefixedFullKey(fullKey: string): boolean {
  if (!fullKey.startsWith(PREFIX)) return MIRROR_RAW_KEYS.has(fullKey);
  const logical = fullKey.slice(PREFIX.length);
  return MIRROR_LOGICAL_KEYS.has(logical);
}

export function shouldMirrorRawKey(rawKey: string): boolean {
  return MIRROR_RAW_KEYS.has(rawKey);
}
