/** Mobius KV TTL defaults (seconds). C-286: extend overnight survival for critical lanes. */
export const KV_TTL_SECONDS = {
  /** Signal micro-sweep snapshot */
  SIGNAL_SNAPSHOT: 14_400,
  /** ECHO summary row */
  ECHO_STATE: 14_400,
  /** Tripwire summary */
  TRIPWIRE_STATE: 14_400,
  /** System pulse row */
  SYSTEM_PULSE: 14_400,
  /** GI latest — was 15m; align with other critical keys so cycle-open is not null-only */
  GI_STATE: 14_400,
  /** MIC readiness snapshot from upstream */
  MIC_READINESS_SNAPSHOT: 14_400,
  /** Consecutive GI ≥ threshold cycles (Fountain sustain) */
  MIC_SUSTAIN_STATE: 604_800,
  /** Decayed replay pressure from ECHO duplicate suppression */
  MIC_REPLAY_PRESSURE: 1_209_600,
  /** Agent fleet heartbeat (cron every 5m; TTL 3× interval) */
  HEARTBEAT: 900,
} as const;
