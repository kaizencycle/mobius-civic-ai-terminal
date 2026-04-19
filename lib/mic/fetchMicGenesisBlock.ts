import type { MicGenesisBlockSummary } from '@/lib/mic/types';

type GenesisEnvelope =
  | (MicGenesisBlockSummary & { ok?: boolean; stub?: boolean; message?: string })
  | { ok: false; reason?: string };

export async function fetchMicGenesisBlock(): Promise<MicGenesisBlockSummary | null> {
  try {
    const response = await fetch('/api/mic/blocks/latest', { cache: 'no-store' });
    const data = (await response.json()) as GenesisEnvelope;
    if (!response.ok || ('ok' in data && data.ok === false)) {
      return null;
    }
    const { ok: _o, stub: _s, message: _m, ...rest } = data as MicGenesisBlockSummary & {
      ok?: boolean;
      stub?: boolean;
      message?: string;
    };
    return rest as MicGenesisBlockSummary;
  } catch (error) {
    console.warn('[mic] genesis block fetch failed', error);
    return null;
  }
}
