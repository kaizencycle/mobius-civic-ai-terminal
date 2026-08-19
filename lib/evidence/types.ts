export type EvidenceCacheDecision =
  | 'FRESH_HIT'
  | 'STALE_ALLOWED'
  | 'REVALIDATE'
  | 'NEW_ACQUISITION'
  | 'LICENSE_DENIED'
  | 'INDEPENDENT_SOURCE_REQUIRED';

export type EvidencePacket = {
  packetId: string;
  version: number;
  requestHash: string;
  contentHash: string;
  normalizedQuery: string;
  claimClass: string;
  subject: string;
  observation: string;
  source: {
    providerId: string;
    sourceUrl?: string;
    acquiredAt: string;
    eventTime?: string | null;
  };
  acquisition: {
    acquiredByAgent: string;
    acquisitionMode: 'FREE' | 'MANUAL_RECEIPT' | 'MOCK_X402';
    price?: { amount: string; currency: string } | null;
    paymentReference?: string | null;
  };
  license: {
    cacheAllowed: boolean;
    federationReuse: boolean;
    publicPayload: boolean;
    publicProvenance: boolean;
  };
  visibility: string;
  freshness: {
    validFrom: string;
    validUntil?: string | null;
    status: 'FRESH' | 'STALE' | 'SUPERSEDED' | 'DISPUTED';
  };
  verification: {
    status: 'PROVISIONAL' | 'CORROBORATED' | 'DISPUTED';
    uniquePacketCount: number;
    independentSourceCount: number;
    conflicts: string[];
  };
  createdAt: string;
};

export type EvidencePacketListItem = EvidencePacket & {
  summary?: {
    readerCount: number;
    reuseCount: number;
    independentSourceCount: number;
    totalPaidAmount?: string;
    totalPaidCurrency?: string;
  };
};

export type EvidenceResolveResponse = {
  ok: boolean;
  degraded?: boolean;
  brokerReachable?: boolean;
  decision?: EvidenceCacheDecision;
  requiresPayment?: boolean;
  reason?: string;
  packet?: EvidencePacket;
  error?: string;
};

export type EvidenceListResponse = {
  ok: boolean;
  degraded?: boolean;
  brokerReachable?: boolean;
  packets?: EvidencePacketListItem[];
  count?: number;
  error?: string;
};

export type EvidenceDetailResponse = {
  ok: boolean;
  degraded?: boolean;
  brokerReachable?: boolean;
  packet?: EvidencePacket;
  reuseEvents?: Array<{
    eventId: string;
    consumerAgent: string;
    purpose: string;
    accessMode: string;
    freshnessAtAccess: string;
    reusedAt: string;
    additionalPayment: { amount: string; currency: string };
  }>;
  summary?: EvidencePacketListItem['summary'];
  error?: string;
};

export const DECISION_OPERATOR_LABEL: Record<EvidenceCacheDecision, string> = {
  FRESH_HIT: 'CACHED · NO NEW PAYMENT',
  STALE_ALLOWED: 'STALE · HISTORICAL ONLY',
  REVALIDATE: 'REFRESH REQUIRED',
  NEW_ACQUISITION: 'NEW ACQUISITION REQUIRED',
  LICENSE_DENIED: 'LICENSE RESTRICTED',
  INDEPENDENT_SOURCE_REQUIRED: 'INDEPENDENT SOURCE REQUIRED',
};

export function acquisitionOperatorLabel(mode: EvidencePacket['acquisition']['acquisitionMode']): string {
  if (mode === 'MOCK_X402') {
    return 'SIMULATED ACQUISITION';
  }
  if (mode === 'FREE') {
    return 'FREE ACQUISITION';
  }
  return 'MANUAL RECEIPT';
}
