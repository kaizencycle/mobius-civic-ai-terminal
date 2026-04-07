/**
 * Nano Banana–style image API wrapper (server-only).
 * Endpoint shape is configurable; ecosystem varies by vendor.
 */

import { createHash } from 'crypto';

export type NanoBananaGenerateInput = {
  prompt: string;
  referenceImageUrls?: string[];
  asyncMode?: boolean;
};

export type NanoBananaGenerateResult =
  | { ok: true; imageUrl: string; raw?: unknown }
  | { ok: false; error: string; queuedJobId?: string };

function getConfig() {
  const apiKey = process.env.NANO_BANANA_API_KEY?.trim();
  const baseUrl = (process.env.NANO_BANANA_BASE_URL ?? '').replace(/\/$/, '');
  const model = process.env.NANO_BANANA_MODEL?.trim() || 'default';
  const timeoutMs = Math.min(120_000, Math.max(5_000, Number(process.env.NANO_BANANA_TIMEOUT_MS) || 45_000));
  return { apiKey, baseUrl, model, timeoutMs };
}

/**
 * Attempt sync generation. If API returns async job id, caller may poll separately (v1 returns failed with hint).
 */
export async function nanoBananaGenerate(input: NanoBananaGenerateInput): Promise<NanoBananaGenerateResult> {
  const { apiKey, baseUrl, model, timeoutMs } = getConfig();

  if (!apiKey || !baseUrl) {
    return { ok: false, error: 'Provider not configured (NANO_BANANA_API_KEY / NANO_BANANA_BASE_URL)' };
  }

  const url = `${baseUrl}/api/v1/generate`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      model,
      mode: input.asyncMode ? 'async' : 'sync',
    };
    if (input.referenceImageUrls?.length) {
      body.referenceImageUrls = input.referenceImageUrls;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      const msg = json && typeof json.error === 'string' ? json.error : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    if (!json) {
      return { ok: false, error: 'Empty provider response' };
    }

    const dataUrl =
      json.data && typeof json.data === 'object' && json.data !== null && 'url' in json.data
        ? (json.data as { url?: unknown }).url
        : undefined;

    const imageUrl =
      (typeof json.imageUrl === 'string' && json.imageUrl) ||
      (typeof json.url === 'string' && json.url) ||
      (typeof json.output_url === 'string' && json.output_url) ||
      (typeof dataUrl === 'string' && dataUrl) ||
      '';

    if (imageUrl) {
      return { ok: true, imageUrl, raw: json };
    }

    const jobId =
      (typeof json.jobId === 'string' && json.jobId) ||
      (typeof json.id === 'string' && json.id) ||
      undefined;
    if (jobId) {
      return { ok: false, error: 'Async job created; polling not implemented in v1', queuedJobId: jobId };
    }

    return { ok: false, error: 'Provider response missing image URL' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return { ok: false, error: controller.signal.aborted ? `Timeout after ${timeoutMs}ms` : msg };
  } finally {
    clearTimeout(timer);
  }
}

export function stableAssetId(parts: string[]): string {
  const h = createHash('sha256').update(parts.join('|')).digest('hex');
  return `gba-${h.slice(0, 24)}`;
}
