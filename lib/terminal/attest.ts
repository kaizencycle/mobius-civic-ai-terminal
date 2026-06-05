// C-305 OPT-03: Substrate write — hardcoded Render endpoint, no GitHub fallback.
// CIVIC_LEDGER_URL must be set; if absent, write is aborted and error is logged.
import { getAgentBearerToken } from '@/lib/substrate/client';

export type AttestPayload = {
  cycle?: string;
  agent?: string;
  event?: string;
  gi?: number;
  [key: string]: unknown;
};

export type AttestResult =
  | { ok: true; endpoint: string }
  | { ok: false; error: string; aborted?: boolean; endpoint?: string };

export async function attestToSubstrate(payload: AttestPayload): Promise<AttestResult> {
  const ledgerUrl = process.env.CIVIC_LEDGER_URL;
  if (!ledgerUrl) {
    console.error('[ATLAS] CIVIC_LEDGER_URL not set — substrate write aborted.');
    return { ok: false, error: 'CIVIC_LEDGER_URL_MISSING', aborted: true };
  }

  const enriched = {
    ...payload,
    source: 'mobius-civic-ai-terminal',
    cycle: payload.cycle ?? process.env.CURRENT_CYCLE ?? 'C-305',
    attestedAt: new Date().toISOString(),
  };

  let res: Response;
  try {
    res = await fetch(ledgerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // C-333 OPT-1: use the canonical token resolver. SUBSTRATE_TOKEN is the
        // INTERNAL cron→endpoint shared secret, NOT the outbound Identity JWT.
        // Sending it to the ledger caused the Branch-C 401 at /auth/introspect.
        Authorization: `Bearer ${getAgentBearerToken()}`,
      },
      body: JSON.stringify(enriched),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch_failed';
    console.error(`[ATLAS] Substrate attest network error: ${ledgerUrl}`, msg);
    return { ok: false, error: msg, endpoint: ledgerUrl };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[ATLAS] Substrate attest failed: ${res.status} ${ledgerUrl}`, body);
    return { ok: false, error: `HTTP ${res.status}`, endpoint: ledgerUrl };
  }

  return { ok: true, endpoint: ledgerUrl };
}
