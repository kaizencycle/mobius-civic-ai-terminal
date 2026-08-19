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

export async function brokerGetPacket(packetId: string, includePayload = false): Promise<EvidenceDetailResponse> {
  try {
    const query = includePayload ? '?includePayload=true' : '';
    const response = await fetch(`${brokerBaseUrl()}/v1/evidence/packets/${encodeURIComponent(packetId)}${query}`, {
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
