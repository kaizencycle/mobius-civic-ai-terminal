// Canonical shard weights and MII threshold sourced from MIC Whitepaper §6.1.
// The operator threshold (0.88) was set in C-296 because the weighted-average
// of agent scores peaks at ~0.93, making 0.95 unreachable in practice.
// Use MII_THRESHOLD_OVERRIDE env var to test alternative values (logged + attributed).

let _overrideLogged = false;

export const CANONICAL_SHARD_WEIGHTS: Record<string, number> = {
  reflection: 1.0,
  learning: 1.0,
  civic: 1.5,
  stability: 2.0,
  stewardship: 2.0,
  innovation: 2.5,
  guardian: 3.0,
};

/** MIC Whitepaper §6.1 canonical threshold. Minting unreachable in practice — see OPERATOR_MII_THRESHOLD. */
export const CANONICAL_MII_THRESHOLD = 0.95;

/** C-296: lowered from 0.95 because weighted-average of agent scores peaks at ~0.93. */
export const OPERATOR_MII_THRESHOLD = 0.88;

/**
 * Returns the effective MII threshold. Checks MII_THRESHOLD_OVERRIDE env var first,
 * then falls back to OPERATOR_MII_THRESHOLD. Any override is logged once at module load.
 */
export function getEffectiveMiiThreshold(): number {
  const raw = process.env.MII_THRESHOLD_OVERRIDE;
  if (raw) {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 1) {
      if (!_overrideLogged) {
        console.warn(
          `[shardConfig] MII_THRESHOLD_OVERRIDE active: ${parsed} (canonical=${CANONICAL_MII_THRESHOLD}, operator=${OPERATOR_MII_THRESHOLD})`
        );
        _overrideLogged = true;
      }
      return parsed;
    }
  }
  return OPERATOR_MII_THRESHOLD;
}
