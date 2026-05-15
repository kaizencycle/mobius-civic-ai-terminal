import type { RawEvent } from '@/lib/echo/sources';

export type SourceAuditPurpose = 'status_integrity_check' | 'documentation_integrity_check' | 'policy_change_check' | 'public_source_check';

export type SourceAuditResult = {
  ok: boolean;
  url: string;
  purpose: SourceAuditPurpose;
  fetched_at: string;
  status_code: number | null;
  content_type: string | null;
  title: string | null;
  freshness_hint: 'fresh' | 'stale' | 'unknown';
  integrity_score: number;
  signals: string[];
  warnings: string[];
  epicon_ready: boolean;
  error: string | null;
};

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const MAX_AUDIT_BYTES = 120_000;
const MAX_REDIRECTS = 3;

function normalizeAllowedUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return null;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return null;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

function titleFromHtml(html: string): string | null {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return null;
  return raw.replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim().slice(0, 160) || null;
}

function freshnessFrom(headers: Headers, body: string): SourceAuditResult['freshness_hint'] {
  const modified = headers.get('last-modified');
  if (modified) {
    const age = Date.now() - new Date(modified).getTime();
    if (Number.isFinite(age)) return age < 1000 * 60 * 60 * 24 * 45 ? 'fresh' : 'stale';
  }
  const lower = body.toLowerCase();
  if (lower.includes('updated') || lower.includes('last modified') || lower.includes('status')) return 'fresh';
  return 'unknown';
}

function scoreAudit(args: { ok: boolean; contentType: string | null; freshness: SourceAuditResult['freshness_hint']; warnings: string[] }): number {
  let score = 0.45;
  if (args.ok) score += 0.25;
  if (args.contentType?.includes('text/html') || args.contentType?.includes('application/json')) score += 0.1;
  if (args.freshness === 'fresh') score += 0.1;
  if (args.freshness === 'stale') score -= 0.1;
  score -= Math.min(0.2, args.warnings.length * 0.05);
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

async function fetchPublicUrlWithRedirectValidation(url: URL): Promise<{ response: Response; finalUrl: URL; redirects: string[] }> {
  let current = url;
  const redirects: string[] = [];

  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const response = await fetch(current.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { 'user-agent': 'Mobius-Integrity-Source-Auditor/0.1' },
    });

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current, redirects };
    }

    const location = response.headers.get('location');
    if (!location) {
      return { response, finalUrl: current, redirects };
    }

    const next = normalizeAllowedUrl(new URL(location, current).toString());
    if (!next) {
      throw new Error('blocked_redirect_target');
    }

    redirects.push(next.toString());
    current = next;
  }

  throw new Error('redirect_limit_exceeded');
}

async function readLimitedText(response: Response, maxBytes = MAX_AUDIT_BYTES): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    return { text: '', truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;

  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = maxBytes - received;
      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining));
        received += remaining;
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }

      chunks.push(value);
      received += value.byteLength;
    }

    if (received >= maxBytes && !truncated) {
      truncated = true;
      await reader.cancel().catch(() => {});
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder().decode(merged), truncated };
}

export async function auditPublicSource(rawUrl: string, purpose: SourceAuditPurpose = 'public_source_check'): Promise<SourceAuditResult> {
  const fetchedAt = new Date().toISOString();
  const url = normalizeAllowedUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      url: rawUrl,
      purpose,
      fetched_at: fetchedAt,
      status_code: null,
      content_type: null,
      title: null,
      freshness_hint: 'unknown',
      integrity_score: 0,
      signals: [],
      warnings: ['blocked_or_invalid_public_url'],
      epicon_ready: false,
      error: 'Only explicit public http/https sources are eligible for audit.',
    };
  }

  try {
    const { response, finalUrl, redirects } = await fetchPublicUrlWithRedirectValidation(url);
    const contentType = response.headers.get('content-type');
    const limited = await readLimitedText(response);
    const body = limited.text;
    const title = contentType?.includes('text/html') ? titleFromHtml(body) : null;
    const freshness = freshnessFrom(response.headers, body);
    const signals: string[] = [];
    const warnings: string[] = [];

    if (response.ok) signals.push('public_source_reachable');
    else warnings.push(`http_status_${response.status}`);
    if (title) signals.push('title_observed');
    if (freshness === 'fresh') signals.push('freshness_hint_present');
    if (freshness === 'stale') warnings.push('source_appears_stale');
    if (contentType) signals.push(`content_type:${contentType.split(';')[0]}`);
    if (redirects.length > 0) signals.push(`redirects_validated:${redirects.length}`);
    if (limited.truncated) warnings.push('response_body_truncated');

    const integrityScore = scoreAudit({ ok: response.ok, contentType, freshness, warnings });

    return {
      ok: response.ok,
      url: finalUrl.toString(),
      purpose,
      fetched_at: fetchedAt,
      status_code: response.status,
      content_type: contentType,
      title,
      freshness_hint: freshness,
      integrity_score: integrityScore,
      signals,
      warnings,
      epicon_ready: response.ok && integrityScore >= 0.55,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      url: url.toString(),
      purpose,
      fetched_at: fetchedAt,
      status_code: null,
      content_type: null,
      title: null,
      freshness_hint: 'unknown',
      integrity_score: 0.2,
      signals: [],
      warnings: ['source_audit_failed'],
      epicon_ready: false,
      error: error instanceof Error ? error.message : 'Unknown audit error',
    };
  }
}

export function auditToRawEvent(audit: SourceAuditResult, cycle: string): RawEvent | null {
  if (!audit.epicon_ready) return null;
  const host = (() => {
    try { return new URL(audit.url).hostname.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 48); } catch { return 'unknown-source'; }
  })();
  return {
    sourceId: `integrity-source-${cycle}-${host}-${audit.fetched_at.slice(0, 13)}`,
    source: 'Mobius Integrity Source Auditor',
    title: `WEB INTEGRITY SIGNAL: ${audit.title ?? host}`.slice(0, 200),
    summary: `HERMES observed public-source metadata for ${audit.purpose}. Score ${audit.integrity_score}. This is observation-only and requires ATLAS/ZEUS review before belief promotion.`,
    url: audit.url,
    timestamp: audit.fetched_at,
    category: audit.purpose === 'status_integrity_check' ? 'infrastructure' : 'governance',
    severity: audit.integrity_score >= 0.75 ? 'low' : 'medium',
    metadata: {
      ownerAgent: 'HERMES',
      reviewers: ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'],
      confidenceTier: audit.integrity_score >= 0.8 ? 1 : 2,
      pulseLane: 'integrity_source_auditor',
      epiconType: 'integrity_signal',
      status: 'needs_verification',
      claimBoundary: 'EPICON proves Mobius observed public-source metadata; it does not prove the underlying public claim is true.',
      audit,
    },
  };
}

export function configuredAuditTargets(): string[] {
  return (process.env.MOBIUS_INTEGRITY_CRAWL_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);
}
