export interface SeoLayer {
  top_domains: string[];
  authority_score: number;
  primary_source_found: boolean;
}

export type AiConsensus = 'aligned' | 'divergent' | 'conflicting';

export interface GeoLayer {
  ai_consensus: AiConsensus;
  citation_count: number;
  semantic_drift: number;
}

export interface AeoLayer {
  snippet_match: boolean;
  direct_answer: string;
  contradiction_detected: boolean;
}

export interface IntegrityLayers {
  seo_layer: SeoLayer;
  geo_layer: GeoLayer;
  aeo_layer: AeoLayer;
}

export type TripwireStatus = 'nominal' | 'triggered' | 'suspended';

export interface MobiusCivicIntegritySignal {
  signal_id: string;
  timestamp: string;
  claim: { text: string; source_node: string };
  integrity_score: number;
  layers: IntegrityLayers;
  tripwire_status: TripwireStatus;
  agent_origin: 'JADE' | 'HERMES';
  cycle: string;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

export function computeIntegrityScore(layers: IntegrityLayers): number {
  const seo = Math.min(
    layers.seo_layer.authority_score * 0.4 +
      (layers.seo_layer.primary_source_found ? 0.1 : 0),
    0.5,
  );

  const consensusScore =
    layers.geo_layer.ai_consensus === 'aligned'
      ? 1.0
      : layers.geo_layer.ai_consensus === 'divergent'
        ? 0.6
        : 0.2;

  const geo = Math.max(
    (consensusScore - layers.geo_layer.semantic_drift * 0.3) * 0.35,
    0,
  );

  const aeo =
    (layers.aeo_layer.snippet_match ? 0.15 : 0) +
    (!layers.aeo_layer.contradiction_detected ? 0.1 : 0);

  return clamp01(Number.parseFloat((seo + geo + aeo).toFixed(3)));
}

export function determineTripwire(layers: IntegrityLayers): TripwireStatus {
  if (layers.aeo_layer.contradiction_detected) return 'triggered';
  if (layers.geo_layer.ai_consensus === 'conflicting') return 'triggered';
  if (layers.geo_layer.semantic_drift > 0.7) return 'triggered';
  if (
    layers.geo_layer.ai_consensus === 'divergent' &&
    !layers.seo_layer.primary_source_found
  ) {
    return 'triggered';
  }
  return 'nominal';
}
