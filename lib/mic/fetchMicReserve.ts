import type { MicReadinessResponse } from '@/lib/mic/types';

export async function fetchMicReserve(): Promise<MicReadinessResponse['reserve'] | null> {
  const response = await fetch('/api/mic/readiness', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed reserve fetch: ${response.status}`);
  const data = (await response.json()) as MicReadinessResponse;
  return data.reserve;
}
