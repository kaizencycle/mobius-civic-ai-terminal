import type { SealRecord } from '@/lib/seal/types';

export async function issueSeal(seal: SealRecord) {
  const ledgerUrl = process.env.CIVIC_LEDGER_URL;
  if (!ledgerUrl) {
    return { ok: false as const, reason: 'ledger_url_missing' as const };
  }

  const res = await fetch(ledgerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(seal),
  });

  if (!res.ok) {
    return { ok: false as const, reason: 'ledger_anchor_failed' as const, status: res.status };
  }

  // Optional OAA hook can be integrated here when configured.
  return {
    ok: true as const,
    seal_id: seal.seal_id,
    seal_hash: seal.seal_hash,
  };
}
