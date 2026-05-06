export type EpiconRuntimeSeverity = 'low' | 'medium' | 'high';

export type EpiconRecommendedAction = 'pass' | 'clarify' | 'quarantine';

export type EpiconGovernanceVerdict = 'pass' | 'clarify' | 'quarantine';

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

export type EpiconPullRequestEvent = {
  repo: string;
  prNumber: number;
  title: string;
  body: string;
  branch: string;
  author: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  changedFilenames: string[];
  timestamp: string;
};

export type EpiconGovernanceReceipt = {
  verdict: EpiconGovernanceVerdict;
  risk: number;
  severity: EpiconRuntimeSeverity;
  consensus: null;
  replayFingerprint: string;
  governanceVersion: 'EPICON-03';
  timestamp: string;
  event: Pick<EpiconPullRequestEvent, 'repo' | 'prNumber' | 'branch' | 'author'>;
  reasons: string[];
  enforcement: 'disabled';
};

export type EpiconGithubCheckSummary = {
  name: 'EPICON Runtime Preview';
  status: 'success' | 'neutral' | 'failure';
  title: string;
  summary: string;
};
