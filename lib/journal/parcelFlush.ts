/**
 * C-372: Journal parcel flush dispatch — piggybacks seal quorum (no new cron).
 */

import { log } from '@/lib/log';
import type { Seal } from '@/lib/vault-v2/types';

export function isJournalFlushEnabled(): boolean {
  const raw = (process.env.JOURNAL_FLUSH ?? '').trim().toLowerCase();
  return raw === 'on' || raw === '1' || raw === 'true';
}

/**
 * Fire-and-forget journal parcel flush after attested seal quorum.
 * Loud failure on missing/revoked DAEDALUS App — never silent degradation.
 */
export function dispatchJournalParcelFlush(seal: Seal): void {
  if (!isJournalFlushEnabled()) {
    log.info('[journalParcelFlush] JOURNAL_FLUSH not enabled — skipping', { seal_id: seal.seal_id });
    return;
  }

  void (async () => {
    try {
      const { flushSealParcelToSubstrate } = await import('@/lib/journal/parcelFlushCore');
      const result = await flushSealParcelToSubstrate(seal);
      log.info('[journalParcelFlush] parcel flush dispatched', {
        seal_id: seal.seal_id,
        pr_url: result.pr_url ?? null,
        parcel_path: result.parcel_path,
        parcel_hash: result.parcel_hash,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error('[journalParcelFlush] FATAL — parcel flush failed (check DAEDALUS App installation)', {
        seal_id: seal.seal_id,
        err: msg,
      });
    }
  })();
}
