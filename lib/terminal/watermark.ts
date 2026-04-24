import type { Redis } from '@upstash/redis';

export type TerminalLaneName = 'journal' | 'snapshot' | 'snapshotLite' | 'agents' | 'ledger' | 'vault' | 'signals';

export type TerminalLaneWatermark = {
  version: number;
  updatedAt: string;
  hotCount?: number;
  canonPending?: number;
  canonWritten?: number;
  canonFailed?: number;
  status?: 'idle' | 'hot' | 'pending' | 'canonical' | 'degraded';
};

export type TerminalWatermark = {
  version: number;
  cycle?: string;
  updatedAt: string;
  lanes: Partial<Record<TerminalLaneName, TerminalLaneWatermark>>;
};

const WATERMARK_KEY = 'terminal:watermark';
const WATERMARK_SEQ_KEY = 'terminal:watermark:seq';

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
}

function asWatermark(input: unknown): TerminalWatermark | null {
  const record = asRecord(input);
  if (!record) return null;
  const version = typeof record.version === 'number' && Number.isFinite(record.version) ? record.version : 0;
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString();
  const lanes = asRecord(record.lanes) ?? {};
  return {
    version,
    updatedAt,
    cycle: typeof record.cycle === 'string' ? record.cycle : undefined,
    lanes: lanes as TerminalWatermark['lanes'],
  };
}

export async function readTerminalWatermark(redis: Redis | null): Promise<TerminalWatermark> {
  const fallback = { version: 0, updatedAt: new Date(0).toISOString(), lanes: {} } satisfies TerminalWatermark;
  if (!redis) return fallback;
  try {
    const raw = await redis.get<unknown>(WATERMARK_KEY);
    return asWatermark(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function bumpTerminalWatermark(
  redis: Redis | null,
  lane: TerminalLaneName,
  patch: Partial<TerminalLaneWatermark> & { cycle?: string } = {},
): Promise<TerminalWatermark | null> {
  if (!redis) return null;
  try {
    const now = new Date().toISOString();
    const [nextVersion, current] = await Promise.all([
      redis.incr(WATERMARK_SEQ_KEY),
      readTerminalWatermark(redis),
    ]);
    const previousLane = current.lanes[lane] ?? { version: 0, updatedAt: now };
    const next: TerminalWatermark = {
      version: typeof nextVersion === 'number' ? nextVersion : current.version + 1,
      cycle: patch.cycle ?? current.cycle,
      updatedAt: now,
      lanes: {
        ...current.lanes,
        [lane]: {
          ...previousLane,
          ...patch,
          version: (previousLane.version ?? 0) + 1,
          updatedAt: now,
        },
      },
    };
    await redis.set(WATERMARK_KEY, JSON.stringify(next));
    return next;
  } catch (error) {
    console.error('[terminal/watermark] bump failed:', error);
    return null;
  }
}
