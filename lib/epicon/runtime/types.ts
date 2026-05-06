export type EpiconRuntimeSeverity = 'low' | 'medium' | 'high';

export type EpiconRecommendedAction = 'pass' | 'clarify' | 'quarantine';

export type EpiconPrSignalInput = {
  filesChanged: number;
  additions: number;
  deletions: number;
  sensitivePaths: string[];
  replaySignals: number;
  scopeMismatch: boolean;
  docsOnly?: boolean;
};

export type EpiconNormalizedPrSignal = EpiconPrSignalInput & {
  totalChanges: number;
  changeVolume: 'small' | 'medium' | 'large';
  sensitivePathCount: number;
};

export type EpiconRuntimeEvaluation = {
  pass: boolean;
  risk: number;
  severity: EpiconRuntimeSeverity;
  recommendedAction: EpiconRecommendedAction;
  reasons: string[];
  normalized: EpiconNormalizedPrSignal;
  meta: {
    evaluator: 'epicon-runtime-layer-0';
    enforcement: 'disabled';
    deterministic: true;
  };
};
