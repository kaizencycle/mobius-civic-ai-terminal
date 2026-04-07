export type GlobeRenderKind = 'incident_card' | 'cycle_hero' | 'domain_icon' | 'overlay_texture';

export type GlobeRenderDomain =
  | 'civic'
  | 'environ'
  | 'financial'
  | 'narrative'
  | 'infrastructure'
  | 'institutional';

export type GlobeRenderAssetRequest = {
  kind: GlobeRenderKind;
  title: string;
  domain?: GlobeRenderDomain;
  prompt?: string;
  signalId?: string;
  cycle?: string;
  severity?: 'nominal' | 'elevated' | 'critical';
  metadata?: Record<string, unknown>;
  referenceImageUrls?: string[];
};

export type GlobeRenderAssetResponse = {
  ok: boolean;
  status: 'queued' | 'completed' | 'failed';
  assetId: string;
  imageUrl?: string;
  provider: 'nano-banana';
  cached: boolean;
  error?: string;
  diagnostics?: {
    provider: string;
    cached: boolean;
    createdAt: string;
    sourceSignalId?: string;
    cycle?: string;
    failureReason?: string;
  };
};

export type GlobeVisualAsset = {
  assetId: string;
  imageUrl: string;
  kind: GlobeRenderKind;
  status: 'queued' | 'completed' | 'failed';
  provider: 'nano-banana';
};

export type CachedGlobeAssetRecord = {
  assetId: string;
  imageUrl: string;
  kind: GlobeRenderKind;
  createdAt: string;
  cacheKey: string;
};
