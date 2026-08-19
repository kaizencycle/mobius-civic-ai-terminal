import { env } from '@/lib/env';
import type {
  EvidenceDetailResponse,
  EvidenceListResponse,
  EvidenceResolveResponse,
} from '@/lib/evidence/types';

function brokerBaseUrl(): string {
  return (
    env.MOBIUS_BROKER_URL ||
    process.env.RENDER_THOUGHT_BROKER_URL ||
    process.env.NEXT_PUBLIC_THOUGHT_BROKER_URL ||
    'http://localhost:4005'
  ).replace(/\/+$/, '');
}

function brokerHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const apiKey = process.env.BROKER_API_KEY || process.env.API_KEY;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

function degraded(error: string): { degraded: true; brokerReachable: false; ok: false; error: string } {
  return { ok: false, degraded: true, brokerReachable: false, error };
}

export async function brokerResolve(body: unknown): Promise<EvidenceResolveResponse> {
  try {
    const response = await fetch(`${brokerBaseUrl()}/v1/evidence/resolve`, {
      method: 'POST',
      headers: brokerHeaders(),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const payload = (await response.json()) as EvidenceResolveResponse;
    if (!response.ok) {
      return { ...payload, ok: false, brokerReachable: true, error: payload.error ?? `broker_${response.status}` };
    }
    return { ...payload, ok: true, brokerReachable: true };
  } catch (error) {
    return degraded(error instanceof Error ? error.message : 'broker_unreachable');
  }
}

export async function brokerListPackets(limit = 50): Promise<EvidenceListResponse> {
  try {
    const response = await fetch(`${brokerBaseUrl()}/v1/evidence/packets?limit=${limit}`, {
      headers: brokerHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const payload = (await response.json()) as EvidenceListResponse;
    if (!response.ok) {
      return { ...payload, ok: false, brokerReachable: true, error: payload.error ?? `broker_${response.status}` };
    }
    return { ...payload, ok: true, brokerReachable: true };
  } catch (error) {
    return degraded(error instanceof Error ? error.message : 'broker_unreachable');
  }
}

/** Metadata + reuse lineage (no payload body). */
export async function brokerGetPacket(packetId: string): Promise<EvidenceDetailResponse> {
  try {
    const response = await fetch(`${brokerBaseUrl()}/v1/evidence/packets/${encodeURIComponent(packetId)}`, {
      headers: brokerHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const payload = (await response.json()) as EvidenceDetailResponse;
    if (!response.ok) {
      return { ...payload, ok: false, brokerReachable: true, error: payload.error ?? `broker_${response.status}` };
    }
    return { ...payload, ok: true, brokerReachable: true };
  } catch (error) {
    return degraded(error instanceof Error ? error.message : 'broker_unreachable');
  }
}

/** Authorized payload read — Substrate POST /packets/:id/payload (records reuse lineage). */
export async function brokerReadPayload(
  packetId: string,
  input: { requesterAgent: string; purpose: string },
): Promise<EvidenceDetailResponse> {
  try {
    const response = await fetch(
      `${brokerBaseUrl()}/v1/evidence/packets/${encodeURIComponent(packetId)}/payload`,
      {
        method: 'POST',
        headers: brokerHeaders(),
        body: JSON.stringify(input),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      },
    );
    const payload = (await response.json()) as EvidenceDetailResponse;
    if (!response.ok) {
      return { ...payload, ok: false, brokerReachable: true, error: payload.error ?? `broker_${response.status}` };
    }
    return { ...payload, ok: true, brokerReachable: true };
  } catch (error) {
    return degraded(error instanceof Error ? error.message : 'broker_unreachable');
  }
}

export async function brokerGetPacketWithPayload(
  packetId: string,
  input: { requesterAgent: string; purpose: string },
): Promise<EvidenceDetailResponse> {
  const meta = await brokerGetPacket(packetId);
  if (!meta.ok || meta.degraded) {
    return meta;
  }
  const payloadRead = await brokerReadPayload(packetId, input);
  if (!payloadRead.ok) {
    return {
      ...meta,
      decision: payloadRead.decision,
      reason: payloadRead.reason,
      error: payloadRead.error,
    };
  }
  return {
    ...meta,
    packet: payloadRead.packet ?? meta.packet,
    payload: payloadRead.payload,
    decision: payloadRead.decision,
    reason: payloadRead.reason,
    summary: payloadRead.summary ?? meta.summary,
  };
}

export async function brokerSubmitCandidates(body: unknown): Promise<{ ok: boolean; degraded?: boolean; error?: string }> {
  try {
    const response = await fetch(`${brokerBaseUrl()}/v1/evidence/candidates`, {
      method: 'POST',
      headers: brokerHeaders(),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    return { ok: response.ok && Boolean(payload.ok), error: payload.error };
  } catch (error) {
    return degraded(error instanceof Error ? error.message : 'broker_unreachable');
  }
}
