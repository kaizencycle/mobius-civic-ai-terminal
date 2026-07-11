/** C-369 schema-aligned types (v0.1) — display contracts only. */

export type FountainStateName =
  | 'DORMANT'
  | 'OBSERVING'
  | 'APPROACHING'
  | 'AUDIT_REQUIRED'
  | 'PROVISIONAL_GI95'
  | 'SUSTAINED_GI95'
  | 'REVIEW_WINDOW_OPEN'
  | 'QUARANTINED'
  | 'CLOSED';

export type SourceDiversity = 'low' | 'moderate' | 'high';

export type ConfidenceLabel = 'low' | 'moderate' | 'high';

export type GIPerceptionManifest = {
  schema_version: '0.1';
  gi: {
    value: number;
    confidence: number;
    confidence_label?: ConfidenceLabel;
    measured_domains: string[];
    instrument_count: number;
    healthy_instruments: number;
    degraded_instruments: number;
    unavailable_instruments: number;
    source_diversity: SourceDiversity;
    known_blind_spots: string[];
    weight_version: string;
    observed_at: string;
  };
  canary_signals?: Array<{
    domain: string;
    correlation_expected: 'high' | 'moderate' | 'low';
    correlation_observed?: number;
    divergence_alert?: boolean;
  }>;
  observed_at: string;
};

export type FountainStateManifest = {
  schema_version: '0.1';
  state: FountainStateName;
  gi_value: number;
  gi_confidence: number;
  sustained_cycles_required: number;
  sustained_cycles_observed: number;
  provisional_since?: string | null;
  review_window?: {
    opened_at?: string | null;
    closes_at?: string | null;
  };
  audit?: {
    status?: 'not_required' | 'pending' | 'in_progress' | 'passed' | 'failed';
    weight_frozen?: boolean;
    adversarial_replay?: 'not_started' | 'in_progress' | 'passed' | 'failed';
    holdout_review?: 'not_started' | 'in_progress' | 'passed' | 'failed';
  };
  quarantine?: {
    active: boolean;
    reasons: string[];
    since?: string | null;
  };
  weight_version: string;
  observed_at: string;
  public_message?: string;
};

export type IntegrityPerceptionResponse = {
  ok: boolean;
  schema_version: '0.1';
  assembled: boolean;
  degraded: boolean;
  gi_perception: GIPerceptionManifest;
  fountain_state: FountainStateManifest;
  sources: {
    gi: string;
    fountain: string;
    signals: string;
  };
  canon: string[];
  at: string;
};
