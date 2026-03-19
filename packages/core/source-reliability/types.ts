export type SourceReliabilityRecord = {
  source_system: string;
  verified_hits: number;
  verified_misses: number;
  reliability_score: number;
  last_updated: string;
};
