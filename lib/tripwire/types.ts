export type TrustTripwireKind =
  | 'provenance_break'
  | 'journal_quality_drift'
  | 'verification_dilution'
  | 'temporal_coherence'
  | 'trust_concentration';

export type TripwireSeverity = 'nominal' | 'elevated' | 'critical';

export type TrustTripwireResult = {
  kind: TrustTripwireKind;
  ok: boolean;
  severity: TripwireSeverity;
  score: number;
  triggered: boolean;
  message: string;
  affectedAgents?: string[];
  affectedPaths?: string[];
  evidence?: Record<string, unknown>;
  timestamp: string;
};

export type TrustTripwireSnapshot = {
  ok: boolean;
  tripwireCount: number;
  elevated: boolean;
  critical: boolean;
  results: TrustTripwireResult[];
  timestamp: string;
};
