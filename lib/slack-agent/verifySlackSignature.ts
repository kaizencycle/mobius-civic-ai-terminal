import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Slack Signing Secret verification (Events API).
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackRequest(args: {
  signingSecret: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const { signingSecret, rawBody, timestampHeader, signatureHeader } = args;
  if (!timestampHeader || !signatureHeader) {
    return { ok: false, reason: 'missing_signature_headers' };
  }
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'bad_timestamp' };
  }
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > 60 * 5) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  const basestring = `v0:${timestampHeader}:${rawBody}`;
  const hmac = createHmac('sha256', signingSecret).update(basestring).digest('hex');
  const expected = `v0=${hmac}`;
  const sig = signatureHeader.trim();
  if (sig.length !== expected.length) {
    return { ok: false, reason: 'signature_mismatch' };
  }
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { ok: false, reason: 'signature_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'signature_mismatch' };
  }
  return { ok: true };
}
