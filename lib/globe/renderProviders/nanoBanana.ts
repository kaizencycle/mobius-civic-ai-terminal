/**
 * Nano Banana wrapper for Replicate-hosted Flux Schnell (server-only).
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
  const timeoutMs = Math.min(120_000, Math.max(5_000, Number(process.env.NANO_BANANA_TIMEOUT_MS) || 45_000));
  return { apiKey, baseUrl, timeoutMs };
}

/**
 * Attempt sync generation. If API returns async job id, caller may poll separately (v1 returns failed with hint).
 */
export async function nanoBananaGenerate(input: NanoBananaGenerateInput): Promise<NanoBananaGenerateResult> {
  const { apiKey, baseUrl, timeoutMs } = getConfig();

  if (!apiKey || !baseUrl) {
    return { ok: false, error: 'Provider not configured (NANO_BANANA_API_KEY / NANO_BANANA_BASE_URL)' };
  }

  const url = `${baseUrl}/v1/models/black-forest-labs/flux-schnell/predictions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      input: {
        prompt: input.prompt,
        aspect_ratio: '16:9',
        output_format: 'webp',
        num_outputs: 1,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
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

    const output =
      json.output && Array.isArray(json.output) && json.output.length > 0
        ? json.output
        : undefined;
    const imageUrl = output && typeof output[0] === 'string' ? output[0] : '';

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
