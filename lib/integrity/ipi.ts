/**
 * Integrity Pressure Index (IPI)
 * EPICON C-355 — Integrity Difficulty Adjustment
 *
 * IPI = anomaly_density × dissent × volatility × witness_lag
 *
 * All components normalized to [0, 1].
 * IPI output range: [0, 1].
 *
 * Constitutional law: cadence tightens when integrity pressure rises.
 * At IPI ≥ 0.95, human witness is mandatory. System cannot self-certify.
 */

export interface IPIComponents {
  /** Rate of flagged events per audit window. [0, 1] */
  anomaly_density: number
  /** Sentinel disagreement rate on recent attestations. [0, 1] */
  dissent: number
  /** GI delta variance across the rolling window. [0, 1] */
  volatility: number
  /**
   * Time since last verified human custodian action, normalized. [0, 1]
   * Encodes Judan's Participation Law: human absence increases pressure
   * independent of GI score.
   */
  witness_lag: number
}

export type IPIState =
  | 'stable'                    // 0.00–0.30
  | 'elevated'                  // 0.30–0.60
  | 'critical_drift'            // 0.60–0.80
  | 'constitutional_instability' // 0.80–0.95
  | 'integrity_crisis'          // 0.95–1.00

export type FountainStatus = 'confirmed' | 'conditional' | 'suspended'

export interface IPIResult {
  /** Computed IPI score. [0, 1] */
  score: number
  /** Constitutional state classification */
  state: IPIState
  /** Raw components used in computation */
  components: IPIComponents
  /**
   * Sentinels triggered at this IPI level.
   * Escalation is additive — higher tiers include all lower-tier sentinels.
   * ZEUS appears only at integrity_crisis (IPI ≥ 0.95).
   */
  triggered_sentinels: string[]
  /**
   * Fountain confirmation status.
   * confirmed: GI Fountain may proceed normally.
   * conditional: Fountain active but under enhanced scrutiny.
   * suspended: Fountain halted. Human custodian required before resumption.
   */
  fountain_status: FountainStatus
  /**
   * True when IPI ≥ 0.95.
   * Encodes Judan's Participation Law: machine-only quorum is insufficient
   * at crisis tier. Human witness is the condition of resumption.
   */
  human_required: boolean
  /** ISO 8601 timestamp of computation */
  computed_at: string
}

/**
 * Compute IPI from normalized component values.
 *
 * Formula: IPI = anomaly_density × dissent × volatility × witness_lag
 *
 * Note: multiplicative structure means all four components must be elevated
 * for IPI to reach crisis tier. A single high component with three low
 * components will not trigger escalation. This is intentional — it
 * prevents single-variable gaming.
 */
export function computeIPI(components: IPIComponents): IPIResult {
  const values = Object.values(components)
  if (values.some(v => v < 0 || v > 1)) {
    throw new Error('[IPI] All components must be normalized to [0, 1]')
  }

  const score = Number(
    (
      components.anomaly_density *
      components.dissent *
      components.volatility *
      components.witness_lag
    ).toFixed(4)
  )

  const state = classifyIPI(score)
  const triggered_sentinels = getSentinelsForState(state)
  const human_required = score >= 0.95
  const fountain_status = resolveFountainStatus(score)

  return {
    score,
    state,
    components,
    triggered_sentinels,
    fountain_status,
    human_required,
    computed_at: new Date().toISOString(),
  }
}

/**
 * Classify IPI score into constitutional state.
 * Thresholds are constitutional law — do not adjust without ZEUS review
 * and human custodian approval per EPICON C-355 amendment protocol.
 */
export function classifyIPI(score: number): IPIState {
  if (score < 0.30) return 'stable'
  if (score < 0.60) return 'elevated'
  if (score < 0.80) return 'critical_drift'
  if (score < 0.95) return 'constitutional_instability'
  return 'integrity_crisis'
}

/**
 * Return triggered sentinel roster for a given state.
 * Escalation is strictly additive — no sentinel is removed at higher tiers.
 * ZEUS appears only at integrity_crisis per Sentinel Asymmetry Principle.
 * ATLAS may not summon full chamber below IPI 0.80 (Quorum Fatigue Law).
 */
export function getSentinelsForState(state: IPIState): string[] {
  switch (state) {
    case 'stable':
      return []
    case 'elevated':
      return ['HERMES', 'ECHO']
    case 'critical_drift':
      return ['HERMES', 'ECHO', 'AUREA', 'JADE']
    case 'constitutional_instability':
      return ['HERMES', 'ECHO', 'AUREA', 'JADE', 'ATLAS', 'EVE']
    case 'integrity_crisis':
      return ['HERMES', 'ECHO', 'AUREA', 'JADE', 'ATLAS', 'EVE', 'ZEUS']
  }
}

/**
 * Resolve Fountain status from IPI score.
 * confirmed  → IPI < 0.80, normal operation
 * conditional → IPI 0.80–0.95, enhanced scrutiny, FAP applies at full weight
 * suspended  → IPI ≥ 0.95, human custodian required before resumption
 */
export function resolveFountainStatus(score: number): FountainStatus {
  if (score >= 0.95) return 'suspended'
  if (score >= 0.80) return 'conditional'
  return 'confirmed'
}

/**
 * Detect Peak Integrity Fallacy pattern in a GI sequence.
 *
 * A peak followed by rapid collapse (≥ 0.15 drop) indicates hidden pressure,
 * not prior strength. Per Hidden Pressure Law (EPICON C-355).
 *
 * Returns true if the pattern is detected.
 */
export function detectPeakFallacy(
  giSequence: number[],
  dropThreshold = 0.15
): boolean {
  if (giSequence.length < 2) return false
  const peak = Math.max(...giSequence.slice(0, -1))
  const last = giSequence[giSequence.length - 1]
  return peak - last >= dropThreshold
}
