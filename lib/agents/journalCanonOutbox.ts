import type { Redis } from '@upstash/redis';
import type { SubstrateJournalWriteInput } from '@/lib/substrate/github-journal';
import { attestToLedger } from '@/lib/substrate/client';
import { bumpTerminalWatermark } from '@/lib/terminal/watermark';
import { log } from '@/lib/log';

export type JournalCanonStatus = 'canon_pending' | 'canon_written' | 'canon_failed';

export type JournalCanonOutboxItem = {
  id: string;
  entry: SubstrateJournalWriteInput;
  status: JournalCanonStatus;
  attempts: number;
  enqueuedAt: string;
  updatedAt: string;
  path?: string;
  error?: string;
};

const OUTBOX_LIST_KEY = 'journal:canon:outbox';
const OUTBOX_ITEM_PREFIX = 'journal:canon:item:';
const OUTBOX_MAX = 500;
const ITEM_TTL_SECONDS = 60 * 60 * 24 * 30;

function itemKey(id: string): string {
  return `${OUTBOX_ITEM_PREFIX}${id}`;
}

function parseMaybeJson(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function asOutboxItem(input: unknown): JournalCanonOutboxItem | null {
  const parsed = parseMaybeJson(input);
  if (!parsed || typeof parsed !== 'object') return null;
  const row = parsed as Partial<JournalCanonOutboxItem>;
  if (!row.id || !row.entry || !row.status) return null;
  return {
    id: row.id,
    entry: row.entry,
    status: row.status,
    attempts: typeof row.attempts === 'number' ? row.attempts : 0,
    enqueuedAt: row.enqueuedAt ?? new Date().toISOString(),
    updatedAt: row.updatedAt ?? new Date().toISOString(),
    path: row.path,
    error: row.error,
  };
}

export async function enqueueJournalCanonWrite(redis: Redis | null, entry: SubstrateJournalWriteInput) {
  if (!redis) return null;
  const now = new Date().toISOString();
  const id = entry.id ?? `journal-canon-${entry.agent}-${entry.cycle}-${Date.now()}`;
  const item: JournalCanonOutboxItem = {
    id,
    entry: { ...entry, id },
    status: 'canon_pending',
    attempts: 0,
    enqueuedAt: now,
    updatedAt: now,
  };

  try {
    await redis.set(itemKey(id), JSON.stringify(item), { ex: ITEM_TTL_SECONDS });
    await redis.lpush(OUTBOX_LIST_KEY, id);
    await redis.ltrim(OUTBOX_LIST_KEY, 0, OUTBOX_MAX - 1);
    await bumpTerminalWatermark(redis, 'journal', { cycle: entry.cycle, status: 'pending', canonPending: 1 });
    return item;
  } catch (error) {
    console.error('[journal/canon-outbox] enqueue failed:', error);
    return null;
  }
}

export async function processJournalCanonOutbox(redis: Redis | null, limit = 5) {
  if (!redis) return { processed: 0, written: 0, failed: 0, pending: 0 };
  let processed = 0;
  let written = 0;
  let failed = 0;
  let pending = 0;

  try {
    const ids = await redis.lrange<string>(OUTBOX_LIST_KEY, 0, Math.max(0, limit - 1));
    for (const id of ids) {
      const item = asOutboxItem(await redis.get<unknown>(itemKey(id)));
      if (!item || item.status === 'canon_written') continue;
      processed += 1;
      // C-317: GitHub PAT write path removed. Civic Protocol Core Ledger is the only write target.
      // attestToLedger resolves the URL via RENDER_LEDGER_URL > CIVIC_LEDGER_URL > hardcoded fallback.
      let result: { ok: boolean; path?: string; error?: string } = { ok: false };
      try {
        const ledgerResult = await attestToLedger({
          id: item.entry.id,
          agent: item.entry.agent,
          agentOrigin: item.entry.agentOrigin,
          cycle: item.entry.cycle,
          title: `Journal: ${item.entry.scope ?? item.entry.category} — ${item.entry.agent}`,
          summary: [item.entry.observation, item.entry.inference, item.entry.recommendation]
            .filter(Boolean).join(' ').slice(0, 500),
          category: (['market','geopolitical','infrastructure','narrative','governance'] as const)
            .includes(item.entry.category as never) ? (item.entry.category as 'market'|'geopolitical'|'infrastructure'|'narrative') : 'infrastructure',
          severity: item.entry.severity as 'nominal' | 'degraded' | 'elevated' | 'critical',
          source: 'agent-journal',
          gi_at_time: item.entry.gi_at_time,
          confidence: item.entry.confidence,
          verified: false,
          derivedFrom: item.entry.derivedFrom ?? [],
          tags: [...(item.entry.tags ?? []), 'journal-canon', `cycle:${item.entry.cycle}`],
        });
        if (ledgerResult.ok) {
          result = { ok: true, path: `ledger:${ledgerResult.entryId ?? 'submitted'}` };
          log.info('[journal/canon-outbox] ledger write ok:', item.entry.id);
        } else {
          result = { ok: false, error: ledgerResult.error ?? 'ledger_write_failed' };
          console.error('[journal/canon-outbox] ledger write failed:', result.error);
        }
      } catch (ledgerErr) {
        result = { ok: false, error: ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr) };
        console.error('[journal/canon-outbox] ledger write threw:', result.error);
      }
      const next: JournalCanonOutboxItem = {
        ...item,
        attempts: item.attempts + 1,
        updatedAt: new Date().toISOString(),
        status: result.ok ? 'canon_written' : 'canon_failed',
        path: result.path ?? item.path,
        error: result.ok ? undefined : result.error ?? 'substrate_write_failed',
      };
      await redis.set(itemKey(id), JSON.stringify(next), { ex: ITEM_TTL_SECONDS });
      await redis.lrem(OUTBOX_LIST_KEY, 1, id);

      if (result.ok) {
        written += 1;
        await bumpTerminalWatermark(redis, 'journal', { cycle: item.entry.cycle, status: 'canonical', canonWritten: 1 });
      } else {
        failed += 1;
        if (next.attempts < 5) {
          await redis.rpush(OUTBOX_LIST_KEY, id);
          pending += 1;
        }
        await bumpTerminalWatermark(redis, 'journal', { cycle: item.entry.cycle, status: 'degraded', canonFailed: 1 });
      }
    }
  } catch (error) {
    console.error('[journal/canon-outbox] process failed:', error);
  }

  return { processed, written, failed, pending };
}
