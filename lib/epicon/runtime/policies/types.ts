import type { EpiconPullRequestEvent } from '../types';

export type RuntimePolicySeverity = 'low' | 'medium' | 'high' | 'critical';

export type RuntimePolicyHit = {
  id: string;
  severity: RuntimePolicySeverity;
  confidence: number;
  note: string;
};

export type RuntimePolicy = {
  id: string;
  evaluate(event: EpiconPullRequestEvent): RuntimePolicyHit | null;
};
