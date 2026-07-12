/**
 * Parse fetch Response bodies safely — Render/Vercel cold-starts and auth
 * redirects often return HTML (<!DOCTYPE …>) which throws opaque SyntaxErrors.
 * EPICON: C-370 production log audit (ZEUS sweep, ledger-zeus).
 */

export type SafeJsonResult<T> =
  | { ok: true; data: T; contentType: string }
  | { ok: false; error: string; contentType: string; status: number; bodyPreview: string };

export async function parseResponseJson<T = unknown>(res: Response): Promise<SafeJsonResult<T>> {
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  const text = await res.text().catch(() => '');

  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    const preview = text.trim().slice(0, 120).replace(/\s+/g, ' ');
    return {
      ok: false,
      error: `response not JSON (content-type: ${contentType || 'missing'})`,
      contentType: contentType || 'missing',
      status: res.status,
      bodyPreview: preview,
    };
  }

  if (text.length === 0) {
    return {
      ok: false,
      error: 'empty JSON body',
      contentType,
      status: res.status,
      bodyPreview: '',
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(text) as T,
      contentType,
    };
  } catch (err) {
    const preview = text.trim().slice(0, 120).replace(/\s+/g, ' ');
    const parseMsg = err instanceof Error ? err.message : 'JSON parse failed';
    return {
      ok: false,
      error: parseMsg,
      contentType,
      status: res.status,
      bodyPreview: preview,
    };
  }
}
