const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

type ClaudeMessageResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

export type ClaudeCallResult =
  | { ok: true; jsonText: string }
  | { ok: false; error: string; httpStatus?: number; responseBody?: string };

function extractText(data: ClaudeMessageResponse): string | null {
  const block = data.content?.[0];
  if (!block || block.type !== 'text' || typeof block.text !== 'string') return null;
  return block.text;
}

export async function callClaudeJson(
  system: string,
  user: string,
): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not configured' };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: 'Claude API request failed',
      httpStatus: res.status,
      responseBody: rawText,
    };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawText) as unknown;
  } catch {
    return {
      ok: false,
      error: 'Claude API returned non-JSON body',
      responseBody: rawText,
    };
  }

  const text = extractText(parsedBody as ClaudeMessageResponse);
  if (text === null) {
    return {
      ok: false,
      error: 'Claude response missing text content',
      responseBody: rawText,
    };
  }

  return { ok: true, jsonText: text };
}
