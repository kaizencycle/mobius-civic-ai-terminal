// lib/integrity/shardConfig.ts
//
// C-326 / OPT-1 (corrected):
// Canonical shard weights + thresholds are SOURCED FROM VENDORED CANON, not
// hand-typed literals. The vendored file (canon/kaizen_shards.yaml) is a
// copy of Mobius-Substrate/configs/kaizen_shards.yaml (MIC_Whitepaper_v2.0.md §6.1).
// Its checksum is pinned in canon/kaizen_shards.sha256 and verified against
// upstream in CI (scripts/verify-canon.mjs).
//
// Two-layer drift guard:
//   Layer 1 (this file + shardConfig.test.ts): .ts constants MUST equal the
//           vendored yaml. No free-floating numbers survive review.
//   Layer 2 (verify-canon.mjs in CI): vendored yaml MUST equal upstream
//           Substrate canon by sha256.
//
// The operator threshold (0.88) is an ATTRIBUTED override of canon (0.95).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface CanonShardConfig {
  threshold_mii: number;
  shard_weights: Record<string, number>;
  shard_weights_normalized?: Record<string, number>;
  min_scores?: Record<string, number>;
  caps?: { per_cycle?: Record<string, number> };
  conversion?: { rate?: number; min_shards_for_payout?: number };
}

const CANON_PATH = join(process.cwd(), 'lib', 'integrity', 'canon', 'kaizen_shards.yaml');

let _canon: CanonShardConfig | null = null;

export function loadCanonShardConfig(): CanonShardConfig {
  if (_canon) return _canon;
  let raw: string;
  try {
    raw = readFileSync(CANON_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `[shardConfig] vendored canon not found at ${CANON_PATH}. ` +
        `Canon must be present; refusing to fall back to defaults. (${String(err)})`,
    );
  }
  const parsed = parse(raw) as CanonShardConfig;
  if (
    !parsed ||
    typeof parsed.threshold_mii !== 'number' ||
    !parsed.shard_weights ||
    typeof parsed.shard_weights !== 'object'
  ) {
    throw new Error('[shardConfig] vendored canon malformed: missing threshold_mii or shard_weights');
  }
  _canon = parsed;
  return _canon;
}

const canon = loadCanonShardConfig();

/** MIC Whitepaper §6.1 canonical reward-multiplier weights. Derived from canon yaml. */
export const CANONICAL_SHARD_WEIGHTS: Record<string, number> = Object.freeze({ ...canon.shard_weights });

/** MIC Whitepaper §6.1 canonical minting threshold (τ). Derived from canon yaml. */
export const CANONICAL_MII_THRESHOLD: number = canon.threshold_mii;

/** Per-shard minimum quality floors. Previously dropped in the Terminal copy — restored from canon. */
export const CANONICAL_MIN_SCORES: Record<string, number> = Object.freeze({ ...(canon.min_scores ?? {}) });

/** Per-cycle anti-spam caps. Previously dropped in the Terminal copy — restored from canon. */
export const CANONICAL_PER_CYCLE_CAPS: Record<string, number> = Object.freeze({
  ...(canon.caps?.per_cycle ?? {}),
});

/**
 * C-296 operator override: lowered from canonical 0.95 because the weighted
 * average of agent scores peaks at ~0.93, making 0.95 unreachable in practice.
 * This is an attributed deviation from canon, not a fork.
 */
export const OPERATOR_MII_THRESHOLD = 0.88;

let _overrideLogged = false;

/**
 * Effective MII threshold used for minting. Resolution order:
 *   1. MII_THRESHOLD_OVERRIDE env var (logged once, attributed)
 *   2. OPERATOR_MII_THRESHOLD (0.88)
 */
export function getEffectiveMiiThreshold(): number {
  const raw = process.env.MII_THRESHOLD_OVERRIDE;
  if (raw) {
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 1) {
      if (!_overrideLogged) {
        console.warn(
          `[shardConfig] MII_THRESHOLD_OVERRIDE active: ${parsed} ` +
            `(canonical=${CANONICAL_MII_THRESHOLD}, operator=${OPERATOR_MII_THRESHOLD})`,
        );
        _overrideLogged = true;
      }
      return parsed;
    }
  }
  return OPERATOR_MII_THRESHOLD;
}

/** True when minting runs below canon — for attaching attribution to minting receipts. */
export function isThresholdBelowCanon(): boolean {
  return getEffectiveMiiThreshold() < CANONICAL_MII_THRESHOLD;
}
