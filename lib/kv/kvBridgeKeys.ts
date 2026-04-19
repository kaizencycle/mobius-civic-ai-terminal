/**
 * Maps Terminal Redis key names to OAA KV bridge allowlist symbols.
 * Bridge accepts logical names (e.g. GI_STATE); Terminal stores `mobius:gi:latest`.
 */

/** Keys accepted by OAA POST /api/kv-bridge/write (must match OAA allowlist). */
export const KV_BRIDGE_SYMBOLS = new Set([
  'GI_STATE',
  'GI_STATE_CARRY',
  'SIGNAL_SNAPSHOT',
  'HEARTBEAT',
  'SYSTEM_PULSE',
  'LAST_INGEST',
  'ECHO_STATE',
  'CURRENT_CYCLE',
  'MIC_READINESS_SNAPSHOT',
  'VAULT_STATE',
  'VAULT_GLOBAL_META',
  'TRIPWIRE_STATE',
  'TRIPWIRE_STATE_KV',
]);

const RAW_TO_SYMBOL: Record<string, string> = {
  TRIPWIRE_STATE: 'TRIPWIRE_STATE',
};

const LOGICAL_TO_SYMBOL: Record<string, string> = {
  'gi:latest': 'GI_STATE',
  'gi:latest_carry': 'GI_STATE_CARRY',
  'signals:latest': 'SIGNAL_SNAPSHOT',
  'heartbeat:last': 'HEARTBEAT',
  'system:pulse': 'SYSTEM_PULSE',
  'ingest:last': 'LAST_INGEST',
  'echo:state': 'ECHO_STATE',
  'operator:current_cycle': 'CURRENT_CYCLE',
  'mic:readiness:snapshot': 'MIC_READINESS_SNAPSHOT',
  'tripwire:state': 'TRIPWIRE_STATE',
  'tripwire:kv:heartbeat': 'TRIPWIRE_STATE_KV',
};

/** Vault balance/meta share one bridge slot (`VAULT_STATE`) as `{ balance, meta }`. */
export const VAULT_BRIDGE_SYMBOL = 'VAULT_STATE' as const;

export function rawRedisKeyToBridgeSymbol(rawKey: string): string | null {
  return RAW_TO_SYMBOL[rawKey] ?? null;
}

export function prefixedRedisKeyToBridgeSymbol(prefixedKey: string): string | null {
  if (!prefixedKey.startsWith('mobius:')) return null;
  const logical = prefixedKey.slice('mobius:'.length);
  if (logical === 'vault:global:balance' || logical === 'vault:global:meta') {
    return VAULT_BRIDGE_SYMBOL;
  }
  return LOGICAL_TO_SYMBOL[logical] ?? null;
}
