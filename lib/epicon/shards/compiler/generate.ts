import { compressCycleBundle } from './compress';
import { validateProposal } from './validate';
import type { EveReserveShard, GenerateShardOptions } from './types';

export function generateShard(options: GenerateShardOptions): EveReserveShard {
  const shard = compressCycleBundle(options);
  const validation = validateProposal(shard);

  if (!validation.ok) {
    throw new Error(`Generated shard failed validation: ${validation.errors.join('; ')}`);
  }

  return shard;
}

export function generateShardDeterministic(
  cycle: string,
  generatedAt = '1970-01-01T00:00:00.000Z',
): EveReserveShard {
  return generateShard({ cycle, generatedAt });
}
