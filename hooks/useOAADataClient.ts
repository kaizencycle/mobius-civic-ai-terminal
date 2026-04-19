'use client';

import { useMemo } from 'react';
import { OAADataClient } from '@/lib/ingestion/OAADataClient';

/** Returns configured OAA client or null when URL/HMAC missing (browser env). */
export function useOAADataClient(): OAADataClient | null {
  return useMemo(() => OAADataClient.fromEnv(), []);
}
