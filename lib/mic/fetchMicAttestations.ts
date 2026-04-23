import type { MicRewardAttestationSummary } from '@/lib/mic/types';

type AttestationsEnvelope = { ok?: boolean; rows?: MicRewardAttestationSummary[] };

export async function fetchMicAttestations(): Promise<MicRewardAttestationSummary[]> {
  try {
    const response = await fetch('/api/mic/attestations', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed attestation fetch: ${response.status}`);
    const body = (await response.json()) as AttestationsEnvelope | MicRewardAttestationSummary[];
    if (Array.isArray(body)) return body;
    return body.rows ?? [];
  } catch (error) {
    console.warn('[mic] attestation fetch failed', error);
    return [];
  }
}
