'use client';

import { useMemo } from 'react';
import { MeshClient, type MeshClientConfig } from '@/lib/mesh/MeshClient';

/**
 * Stable `MeshClient` for hybrid IPFS gateway + Terminal API reads.
 * Pass `config` only in tests; production uses `NEXT_PUBLIC_*` env.
 */
export function useMeshClient(config?: Partial<MeshClientConfig>): MeshClient {
  return useMemo(() => new MeshClient(config), [config]);
}
