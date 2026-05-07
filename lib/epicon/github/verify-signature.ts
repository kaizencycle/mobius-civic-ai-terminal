import crypto from 'node:crypto';

const GITHUB_SIGNATURE_PREFIX = 'sha256=';

function timingSafeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) return false;

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function verifyGithubWebhookSignature({
  body,
  signature,
  secret,
}: {
  body: string;
  signature: string | null;
  secret: string | undefined;
}): boolean {
  if (!secret || !signature?.startsWith(GITHUB_SIGNATURE_PREFIX)) {
    return false;
  }

  const expectedSignature = `${GITHUB_SIGNATURE_PREFIX}${crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')}`;

  return timingSafeEqual(expectedSignature, signature);
}
