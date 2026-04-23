import type { MicReadinessResponse } from '@/lib/mic/types';

export async function fetchMicQuorum(): Promise<MicReadinessResponse['quorum'] | null> {
  const response = await fetch('/api/mic/readiness', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed quorum fetch: ${response.status}`);
  const data = (await response.json()) as MicReadinessResponse;
  return data.quorum;
}
