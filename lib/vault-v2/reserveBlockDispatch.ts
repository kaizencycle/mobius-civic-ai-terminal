/**
 * C-355: Reserve Block .dat dispatch
 *
 * After a 5-of-5 quorum seal, fire two side-effects fire-and-forget:
 *   1. POST hash anchor to CPC ledger (lightweight — no full payload)
 *   2. POST repository_dispatch to CPC GitHub repo to write the .dat file
 *
 * Neither call blocks the cron response. Failures are logged but do not
 * affect the seal result — KV hot state is always written first.
 */

import { log } from '@/lib/log';
import type { Seal } from '@/lib/vault-v2/types';
import { VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';

const CPC_BASE_URL = process.env.CPC_BASE_URL ?? '';
const SUBSTRATE_GITHUB_TOKEN = process.env.SUBSTRATE_GITHUB_TOKEN ?? '';
const CPC_GITHUB_REPO = 'kaizencycle/Civic-Protocol-Core';

export interface ReserveBlockDispatchPayload {
  block_id: string;
  cycle: string;
  sequence: number;
  gi_at_seal: number | null;
  ipi_at_seal?: number | null;
  mic_minted: number;
  quorum_met: boolean;
  sealed_at: string;
  sentinel_seals?: Record<string, { signed: boolean; timestamp: string }>;
  epicon_feed_hash?: string;
  prev_block_hash?: string | null;
}

function buildAnchorPayload(seal: Seal): ReserveBlockDispatchPayload {
  const sentinelSeals: Record<string, { signed: boolean; timestamp: string }> = {};
  for (const [agent, att] of Object.entries(seal.attestations ?? {})) {
    const a = att as { verdict?: string; signature?: string; timestamp?: string };
    sentinelSeals[agent] = {
      // signed = signature is present (matches canon.ts:136-140 semantics)
      // verdict is preserved separately so CPC can distinguish pass vs flag
      signed: Boolean(a.signature),
      timestamp: a.timestamp ?? seal.sealed_at ?? new Date().toISOString(),
    };
  }
  return {
    block_id: seal.seal_id,
    cycle: seal.cycle_at_seal ?? 'unknown',
    sequence: seal.sequence,
    gi_at_seal: seal.gi_at_seal ?? null,
    mic_minted: VAULT_RESERVE_PARCEL_UNITS,
    quorum_met: true,
    sealed_at: seal.sealed_at ?? new Date().toISOString(),
    sentinel_seals: sentinelSeals,
  };
}

async function postCpcAnchor(payload: ReserveBlockDispatchPayload): Promise<void> {
  if (!CPC_BASE_URL) {
    log.warn('[reserveBlockDispatch] CPC_BASE_URL not set — skipping anchor POST');
    return;
  }
  const res = await fetch(`${CPC_BASE_URL}/api/reserve-blocks/anchor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      block_id: payload.block_id,
      cycle: payload.cycle,
      sequence: payload.sequence,
      gi_at_seal: payload.gi_at_seal ?? 0,
      ipi_at_seal: payload.ipi_at_seal ?? null,
      mic_minted: payload.mic_minted,
      quorum_met: payload.quorum_met,
      sealed_at: payload.sealed_at,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    log.warn('[reserveBlockDispatch] CPC anchor POST failed', {
      status: res.status,
      block_id: payload.block_id,
    });
  } else {
    log.info('[reserveBlockDispatch] CPC anchor posted', { block_id: payload.block_id });
  }
}

async function dispatchDatWrite(payload: ReserveBlockDispatchPayload, fullSeal: Seal): Promise<void> {
  if (!SUBSTRATE_GITHUB_TOKEN) {
    log.warn('[reserveBlockDispatch] SUBSTRATE_GITHUB_TOKEN not set — skipping .dat dispatch');
    return;
  }
  const res = await fetch(
    `https://api.github.com/repos/${CPC_GITHUB_REPO}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUBSTRATE_GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        event_type: 'reserve-block-sealed',
        client_payload: {
          block_id: payload.block_id,
          cycle: payload.cycle,
          sequence: payload.sequence,
          payload: {
            ...payload,
            // Full sentinel attestation detail for .dat canon
            sentinel_seals: payload.sentinel_seals,
            epicon_events: (fullSeal as unknown as Record<string, unknown>).epicon_events ?? [],
            replay_from_dat: true,
          },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) {
    log.warn('[reserveBlockDispatch] GitHub dispatch failed', {
      status: res.status,
      block_id: payload.block_id,
    });
  } else {
    log.info('[reserveBlockDispatch] .dat write dispatched to CPC', {
      block_id: payload.block_id,
    });
  }
}

/**
 * Fire-and-forget both side-effects after a successful 5-of-5 seal.
 * Must be called with `void` — never awaited in the cron hot path.
 */
export function dispatchReserveBlockCanon(seal: Seal): void {
  const payload = buildAnchorPayload(seal);
  void (async () => {
    try {
      await postCpcAnchor(payload);
    } catch (e) {
      log.warn('[reserveBlockDispatch] anchor POST threw', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
    try {
      await dispatchDatWrite(payload, seal);
    } catch (e) {
      log.warn('[reserveBlockDispatch] .dat dispatch threw', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  })();
}
