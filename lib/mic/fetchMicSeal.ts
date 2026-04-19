import type { MicSealSnapshot } from '@/lib/mic/types';

export async function fetchMicSeal(): Promise<MicSealSnapshot | null> {
  try {
    const response = await fetch('/api/mic/seals/latest', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed seal fetch: ${response.status}`);
    return (await response.json()) as MicSealSnapshot;
  } catch (error) {
    console.warn('[mic] seal fetch failed', error);
    return null;
  }
}
