import { resolveCycleBundle } from '@/lib/epicon/shards/compiler/fixtures/c368';
import type { CycleShardBundle } from '@/lib/epicon/shards/compiler/types';

export function discoverCycleBundle(cycleId: string): CycleShardBundle | null {
  return resolveCycleBundle(cycleId);
}

export function listDiscoverableCycles(): string[] {
  return ['C-368'];
}
