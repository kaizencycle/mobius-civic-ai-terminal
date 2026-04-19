import type { MicReadinessResponse } from '@/lib/mic/types';

export async function fetchMicReadiness(): Promise<MicReadinessResponse | null> {
  try {
    const response = await fetch('/api/mic/readiness', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed readiness fetch: ${response.status}`);
    return (await response.json()) as MicReadinessResponse;
  } catch (error) {
    console.warn('[mic] readiness fetch failed', error);
    return null;
  }
}
